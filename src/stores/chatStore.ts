import { Canon, Chronicle, DEFAULT_WORLD_STATE, WorldState } from "@/lib/domain/schema";
import {
    appendUser,
    ChatNode,
    ChatNodeId,
    ChatTree,
    createEmptyTree,
    getAlternatives,
    regenerateAssistant,
    replyAssistant,
    rewriteNode,
    setActive,
    setHead
} from '@/lib/llm/chatTree';
import { GeminiConfig } from '@/lib/llm/gemini';
import { applyStatePatch, migrateState } from "@/lib/llm/stateManager";
import { ChatSession, ChatSessionMetadata } from '@/lib/persistence';
import { ThinkingLevel } from '@google/genai';
import { create } from 'zustand';

const DEFAULT_SYSTEM_PROMPT = `You are a creative roleplay partner. Write in a vivid, engaging style.`;

interface ChatState {
    tree: ChatTree;
    isGenerating: boolean;
    sidebarOpen: boolean;
    worldInfoOpen: boolean;
    rightSidebarMode: 'state' | 'canon';

    // Canon Management
    canonDrafts: any[]; // Using any for now to avoid circular deps or complex type exports, will refine
    isCurating: boolean;

    config: GeminiConfig;

    // World Context
    canon?: Canon;
    chronicle?: Chronicle;

    // Session State
    currentSessionId: string | null;
    sessions: ChatSessionMetadata[];
    isSessionLoading: boolean;

    // Actions
    initialize: () => void;
    setSidebarOpen: (open: boolean) => void;
    setWorldInfoOpen: (open: boolean) => void;
    setRightSidebarMode: (mode: 'state' | 'canon') => void;
    updateConfig: (config: Partial<GeminiConfig>) => void;

    // Session Actions
    loadSessions: () => Promise<void>;
    createSession: () => Promise<string | undefined>;
    loadSession: (sessionId: string) => Promise<void>;
    saveSession: () => Promise<void>;

    sendMessage: (text: string) => Promise<void>;
    regenerate: (nodeId?: ChatNodeId) => Promise<void>;

    navigateBranch: (nodeId: ChatNodeId, direction: 'prev' | 'next') => void;
    editMessage: (nodeId: ChatNodeId, newText: string) => Promise<void>;


    generateTitle: () => Promise<void>;
    renameSession: (sessionId: string, newTitle: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;

    // State Actions
    setCanon: (canon: Canon) => void;
    setChronicle: (chronicle: Chronicle) => void;
    updatePlayerName: (name: string) => void;

    // Canon Actions
    runCuration: () => Promise<void>;
    approveCanonDraft: (index: number) => void;
    rejectCanonDraft: (index: number) => void;

    // Manual Canon Management
    addCanonEntry: (entry: Omit<Canon['entries'][0], 'id'>) => Promise<void>;
    updateCanonEntry: (id: string, updates: Partial<Canon['entries'][0]>) => Promise<void>;
    deleteCanonEntry: (id: string) => Promise<void>;
    updateGlobalRules: (rules: string[]) => Promise<void>;
    wrapUpChapter: () => Promise<void>;

    ensureSession: () => Promise<string | undefined>;
}

export const useChatStore = create<ChatState>((set, get) => ({
    tree: createEmptyTree(DEFAULT_SYSTEM_PROMPT),
    isGenerating: false,
    sidebarOpen: true,
    worldInfoOpen: false,
    rightSidebarMode: 'state',

    canonDrafts: [],
    isCurating: false,

    config: {
        model: "gemini-3-flash-preview",
        temperature: 0.7,
        presencePenalty: 0.0,
        frequencyPenalty: 0.0,
        thinkingLevel: ThinkingLevel.MEDIUM,
        includeThoughts: true,
    },

    currentSessionId: null,
    sessions: [],
    isSessionLoading: false,

    canon: undefined,
    chronicle: undefined,

    initialize: () => {
        get().loadSessions();
    },

    setCanon: (canon) => set({ canon }),
    setChronicle: (chronicle) => set({ chronicle }),

    updatePlayerName: (name: string) => {
        const { tree } = get();
        // Find latest state node
        let pId: ChatNodeId | undefined = tree.headId;
        let targetNodeId: ChatNodeId | undefined;
        let currentState: WorldState | undefined;

        while (pId) {
            const node = tree.nodes[pId] as ChatNode;
            if (node.state) {
                targetNodeId = pId;
                currentState = migrateState(node.state);
                break;
            }
            pId = node.parentId;
        }

        // Fallback: If no state found (e.g. at start of chat), attach to HEAD node
        if (!targetNodeId || !currentState) {
            targetNodeId = tree.headId;
            currentState = DEFAULT_WORLD_STATE;
        }

        if (targetNodeId && currentState) {
            // Create updated state
            const nextState = {
                ...currentState,
                player: {
                    ...currentState.player,
                    name
                }
            };

            // Update node in tree (shallow clone tree and nodes)
            const nextTree = {
                ...tree,
                nodes: {
                    ...tree.nodes,
                    [targetNodeId]: {
                        ...tree.nodes[targetNodeId],
                        state: nextState
                    }
                }
            };

            set({ tree: nextTree });
            get().saveSession(); // Persist change
        }
    },

    // Canon Actions
    runCuration: async () => {
        const { tree, canon, chronicle, config } = get();
        // Find latest state
        let pId: ChatNodeId | undefined = tree.headId;
        let currentState: WorldState | undefined;
        while (pId) {
            const node = tree.nodes[pId] as ChatNode;
            if (node.state) {
                currentState = migrateState(node.state);
                break;
            }
            pId = node.parentId;
        }

        if (!currentState) return; // No state to curate

        set({ isCurating: true });
        try {
            const response = await fetch('/api/curate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    context: {
                        canon: canon || { entries: [], globalRules: [] },
                        chronicle: chronicle || { events: [], chapters: [] },
                        state: currentState
                    }
                })
            });

            if (!response.ok) throw new Error('Curation API failed');

            const data = await response.json();
            set({ canonDrafts: data.proposals || [] });
        } catch (e) {
            console.error("Curation failed:", e);
        } finally {
            set({ isCurating: false });
        }
    },

    approveCanonDraft: async (index: number) => {
        const { canon, canonDrafts } = get();
        const draft = canonDrafts[index];
        if (!draft) return;

        // Initialize canon if it doesn't exist
        let nextCanon = canon ? { ...canon } : { entries: [], globalRules: [] };

        // Ensure entries exist
        if (!nextCanon.entries) nextCanon.entries = [];

        if (draft.type === 'CREATE') {
            // Add new entry
            const newEntry = {
                ...draft.entry,
                id: crypto.randomUUID(), // Assign new ID
            };
            nextCanon.entries = [...nextCanon.entries, newEntry];
        } else if (draft.type === 'UPDATE' && draft.targetCanonId) {
            // Update existing entry
            nextCanon.entries = nextCanon.entries.map(e => {
                if (e.id === draft.targetCanonId) {
                    return { ...e, ...draft.entry, id: e.id }; // Merge new content but keep ID
                }
                return e;
            });
        }

        // Remove from drafts
        const nextDrafts = canonDrafts.filter((_, i) => i !== index);

        set({ canon: nextCanon, canonDrafts: nextDrafts });
        await get().ensureSession();
        get().saveSession();
    },

    rejectCanonDraft: (index: number) => {
        const { canonDrafts } = get();
        const nextDrafts = canonDrafts.filter((_, i) => i !== index);
        set({ canonDrafts: nextDrafts });
    },

    ensureSession: async () => {
        const { currentSessionId } = get();
        if (currentSessionId) return currentSessionId;

        const newId = await get().createSession();
        if (newId) {
            set({ currentSessionId: newId });
            return newId;
        }
    },

    addCanonEntry: async (entry) => {
        const { canon } = get();
        let nextCanon = canon ? { ...canon } : { entries: [], globalRules: [] };
        if (!nextCanon.entries) nextCanon.entries = [];

        const newEntry = {
            ...entry,
            id: crypto.randomUUID() as any, // Cast to any to satisfy Opaque type if needed, or string
        };

        nextCanon.entries = [...nextCanon.entries, newEntry];
        set({ canon: nextCanon });

        await get().ensureSession();
        get().saveSession();
    },

    updateCanonEntry: async (id, updates) => {
        const { canon } = get();
        if (!canon) return;

        let nextCanon = { ...canon };
        if (!nextCanon.entries) return;

        nextCanon.entries = nextCanon.entries.map(e =>
            e.id === id ? { ...e, ...updates } : e
        );

        set({ canon: nextCanon });
        await get().ensureSession();
        get().saveSession();
    },

    deleteCanonEntry: async (id) => {
        const { canon } = get();
        if (!canon || !canon.entries) return;

        let nextCanon = { ...canon };
        nextCanon.entries = nextCanon.entries.filter(e => e.id !== id);

        set({ canon: nextCanon });
        await get().ensureSession();
        get().saveSession();
    },

    updateGlobalRules: async (rules: string[]) => {
        const { canon } = get();
        // Initialize if missing
        let nextCanon = canon ? { ...canon } : { entries: [], globalRules: [] };

        nextCanon.globalRules = rules;

        set({ canon: nextCanon });
        await get().ensureSession();
        get().saveSession();
    },

    wrapUpChapter: async () => {
        const { chronicle } = get();
        if (!chronicle || chronicle.events.length === 0) return;

        console.log("Wrapping up chapter...");
        try {
            const eventsToSummarize = [...chronicle.events];

            const res = await fetch('/api/chronicle/chapter', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ events: eventsToSummarize })
            });

            if (!res.ok) throw new Error("Failed to summarize chapter");
            const { title, summary } = await res.json();

            console.log("Chapter created:", title);

            // Create new Chapter
            const newChapter = {
                id: crypto.randomUUID(),
                title,
                summary,
                eventIds: eventsToSummarize.map(e => e.id)
            };

            // Update Store: Add chapter, Clear events
            const nextChronicle = {
                events: [], // Clear accumulated events
                chapters: [...chronicle.chapters, newChapter]
            };

            set({ chronicle: nextChronicle });
            await get().saveSession();
        } catch (error) {
            console.error("Wrap up failed", error);
        }
    },

    loadSessions: async () => {
        try {
            const res = await fetch('/api/sessions');
            if (res.ok) {
                const sessions = await res.json();
                set({ sessions });
            }
        } catch (error) {
            console.error("Failed to load sessions", error);
        }
    },

    createSession: async () => {
        // Reset state for new session
        const newTree = createEmptyTree(DEFAULT_SYSTEM_PROMPT);
        const { config } = get();
        const id = crypto.randomUUID();
        const now = new Date().toISOString();

        const session: ChatSession = {
            id,
            title: "New Chat",
            createdAt: now,
            updatedAt: now,
            tree: newTree,
            config,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            canon: undefined, // Start fresh
            chronicle: undefined // Start fresh
        };

        try {
            const res = await fetch('/api/sessions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(session)
            });

            if (res.ok) {
                // Optimistic update of list
                set({
                    sessions: [{ id, title: session.title, createdAt: now, updatedAt: now }, ...get().sessions]
                    // Do NOT set currentSessionId here, let the router-driven loadSession do it
                });
                return id;
            }
        } catch (error) {
            console.error("Failed to create session", error);
        }
    },

    loadSession: async (sessionId) => {
        if (sessionId === get().currentSessionId) return;

        set({ isSessionLoading: true });
        try {
            const res = await fetch(`/api/sessions/${sessionId}`);
            if (res.ok) {
                const session: ChatSession = await res.json();

                // DATA MIGRATION: Fix legacy state fields (status -> condition, title -> label)
                if (session.tree && session.tree.nodes) {
                    Object.keys(session.tree.nodes).forEach(key => {
                        const nodeId = key as ChatNodeId;
                        const node = session.tree.nodes[nodeId] as ChatNode;
                        if (node.state) {
                            node.state = migrateState(node.state);
                        }
                    });
                }

                set({
                    tree: session.tree,
                    config: session.config,
                    currentSessionId: session.id,
                    canon: session.canon,
                    chronicle: session.chronicle,
                    // If system prompt is different, we might want to store it (but store doesn't have it yet except in const)
                    // ignoring system prompt restore for now to keep it simple, or user can assume default.
                });
            }
        } catch (error) {
            console.error("Failed to load session", error);
        } finally {
            set({ isSessionLoading: false });
        }
    },

    saveSession: async () => {
        const { currentSessionId, tree, config, canon, chronicle } = get();
        if (!currentSessionId) return; // Cannot save if not in a session

        // Find current title or generate one? For now just keep old title or "New Chat"
        // In a real app we'd fetch the current session metadata to keep title,
        // or update title based on first message.

        const currentSession = get().sessions.find(s => s.id === currentSessionId);
        const title = currentSession?.title || "New Chat"; // Use existing title

        const now = new Date().toISOString();
        const session: ChatSession = {
            id: currentSessionId,
            title,
            createdAt: now, // Ideally keep original
            updatedAt: now,
            tree,
            config,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            canon,
            chronicle
        };

        try {
            await fetch(`/api/sessions/${currentSessionId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(session)
            });
            // Update list timestamp
            get().loadSessions();
        } catch (error) {
            console.error("Failed to save session", error);
        }
    },

    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setWorldInfoOpen: (open) => set({ worldInfoOpen: open }),
    setRightSidebarMode: (mode) => set({ rightSidebarMode: mode }),

    updateConfig: (newConfig) => set((state) => ({ config: { ...state.config, ...newConfig } })),

    sendMessage: async (text) => {
        const { tree, config, canon, chronicle } = get();

        // 1. Add User Node
        const nextTree = appendUser(tree, text);
        set({ tree: nextTree, isGenerating: true });

        // Calculate latest state to trigger context
        // Traverse back from head to find state. 
        // For appendUser, head is UserNode. Parent is AssistantNode (usually has state).
        // Let's find the 'current' state before this new turn.
        // The user node doesn't have state. The previous assistant node has state.

        let currentState: WorldState | undefined = undefined;
        let pId = nextTree.nodes[nextTree.headId].parentId;
        while (pId) {
            const node = nextTree.nodes[pId];
            if (node.state) {
                currentState = migrateState(node.state);
                break;
            }
            pId = node.parentId;
        }

        try {
            // 2. Call API
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: nextTree,
                    config,
                    context: {
                        canon,
                        chronicle,
                        state: currentState
                    }
                }),
            });

            if (!response.ok) throw new Error('API request failed');
            const data = await response.json();

            // 3. Handle State Patch
            let nextState = currentState || DEFAULT_WORLD_STATE;
            if (data.statePatch) {
                // Apply patch (if no current state, patch against default)
                nextState = applyStatePatch(nextState, data.statePatch);
                console.log("State updated:", nextState);

                // HANDLE CHRONICLE EVENTS
                if (data.statePatch.events && data.statePatch.events.length > 0) {
                    const newEvents = data.statePatch.events.map((e: any) => ({
                        id: crypto.randomUUID(),
                        ...e
                    }));

                    // 1. Check for Scene Transition (Start of NEW scene)
                    // If we are starting a new scene, the PREVIOUS events belong to the old chapter.
                    const hasSceneStart = newEvents.some((e: any) => e.type === 'SCENE_START');
                    const currentChronicle = get().chronicle || { events: [], chapters: [] };

                    if (hasSceneStart && currentChronicle.events.length > 0) {
                        console.log("Scene Start detected: Wrapping up previous chapter first.");
                        // Await the wrap up so it finishes before we append new events
                        await get().wrapUpChapter();
                    }

                    // 2. Refresh state (as wrapUpChapter might have cleared events)
                    const latestChronicle = get().chronicle || { events: [], chapters: [] };

                    // 3. Append new events
                    const nextChronicle = {
                        ...latestChronicle,
                        events: [...latestChronicle.events, ...newEvents]
                    };

                    // 4. Update Store
                    set({ chronicle: nextChronicle });
                    await get().saveSession();

                    // 5. Post-Append Checks
                    // If we explicitly end a scene, or if the buffer is just too full
                    const hasSceneEnd = newEvents.some((e: any) => e.type === 'SCENE_END');
                    const isOverflowing = nextChronicle.events.length >= 20;

                    if (hasSceneEnd || isOverflowing) {
                        console.log("Triggering auto-wrap up:", { hasSceneEnd, count: nextChronicle.events.length });
                        // Run in background / parallel
                        get().wrapUpChapter();
                    }
                }
            }

            // 4. Add Assistant Node with (potentially updated) State
            const finalTree = replyAssistant(nextTree, nextTree.headId, data.parts, nextState);
            set({ tree: finalTree });

            // Auto-save
            get().saveSession();

            // Auto-generate title if needed
            // Trigger if it's the first assistant response (meaning total nodes usually around 3: root(system) + user + assistant)
            // Or if title is still "New Chat" and we have enough context.
            const sessionTitle = get().sessions.find(s => s.id === get().currentSessionId)?.title;
            const nodeCount = Object.keys(finalTree.nodes).length;

            // Simple heuristic: if title is "New Chat" and we have a few messages
            if (sessionTitle === "New Chat" && nodeCount <= 6) {
                // Trigger background title generation
                get().generateTitle();
            }

        } catch (error) {
            console.error(error);
            // Ideally add an error node/toast
        } finally {
            set({ isGenerating: false });
        }
    },

    regenerate: async (nodeId) => {
        const { tree, config, canon, chronicle } = get();
        const targetId = nodeId || tree.headId;
        const node = tree.nodes[targetId];

        if (!node || node.role !== 'assistant') {
            console.warn("Can only regenerate assistant nodes");
            return;
        }

        set({ isGenerating: true });

        try {
            const parentId = node.parentId;
            if (!parentId) throw new Error("Root node cannot be regenerated");

            // Calculate state at parent level (before the assistant response)
            // Traverse from parentId up
            let currentState: WorldState | undefined = undefined;
            let pId: ChatNodeId | undefined = parentId;
            while (pId) {
                const n = tree.nodes[pId] as ChatNode;
                if (n.state) {
                    currentState = migrateState(n.state);
                    break;
                }
                pId = n.parentId;
            }

            const tempTree = setHead(tree, parentId);

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: tempTree,
                    config,
                    context: {
                        canon,
                        chronicle,
                        state: currentState
                    }
                }),
            });

            if (!response.ok) throw new Error('API request failed');
            const data = await response.json();

            // Handle State Patch
            let nextState = currentState || DEFAULT_WORLD_STATE;
            if (data.statePatch) {
                nextState = applyStatePatch(nextState, data.statePatch);
                console.log("State updated (regen):", nextState);

                // HANDLE CHRONICLE EVENTS (Existing events from the replaced node's future are not automatically reverted, 
                // but for now we just append new ones. Ideally we might want to prune events after the regen point? 
                // Complexity warning: Pruning chronicle on regen is hard without linking events to nodes. 
                // For now, simple append.)
                if (data.statePatch.events && data.statePatch.events.length > 0) {
                    const newEvents = data.statePatch.events.map((e: any) => ({
                        id: crypto.randomUUID(),
                        ...e
                    }));
                    const currentChronicle = get().chronicle || { events: [], chapters: [] };
                    set({ chronicle: { ...currentChronicle, events: [...currentChronicle.events, ...newEvents] } });
                }
            }

            // Add as sibling (regenerate)
            const finalTree = regenerateAssistant(tree, targetId, data.parts, nextState);
            set({ tree: finalTree });

            // Auto-save
            get().saveSession();

        } catch (error) {
            console.error(error);
        } finally {
            set({ isGenerating: false });
        }
    },

    navigateBranch: (nodeId, direction) => {
        const { tree } = get();
        const node = tree.nodes[nodeId];
        if (!node || !node.parentId) return;

        const siblings = getAlternatives(tree, node.parentId);
        const currentIndex = siblings.findIndex(n => n.id === nodeId);
        if (currentIndex === -1) return;

        let nextIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;

        if (nextIndex < 0) nextIndex = siblings.length - 1; // Loop back
        if (nextIndex >= siblings.length) nextIndex = 0; // Loop forward

        const nextNode = siblings[nextIndex];
        const nextTree = setActive(tree, nextNode.id);
        set({ tree: nextTree });
    },

    editMessage: async (nodeId, newText) => {
        const { tree, config, canon, chronicle } = get();
        const node = tree.nodes[nodeId];

        if (!node) return;

        // 1. Rewrite Node (Create sibling)
        const nextTree = rewriteNode(tree, nodeId, [{ kind: 'text', text: newText }]);
        set({ tree: nextTree });

        // 2. If User, auto-generate response
        if (node.role === 'user') {
            set({ isGenerating: true });

            // Calculate state at new user node's parent (previous assistant state usually)
            // nextTree.headId is the new User Node. parent is the previous Assistant.

            let currentState: WorldState | undefined = undefined;
            // The newly added node is at headId
            let pId = nextTree.nodes[nextTree.headId].parentId;
            while (pId) {
                const n = nextTree.nodes[pId];
                if (n.state) {
                    currentState = migrateState(n.state);
                    break;
                }
                pId = n.parentId;
            }

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        tree: nextTree,
                        config,
                        context: {
                            canon,
                            chronicle,
                            state: currentState
                        }
                    }),
                });

                if (!response.ok) throw new Error('API request failed');
                const data = await response.json();

                // Handle State Patch
                let nextState = currentState || DEFAULT_WORLD_STATE;
                if (data.statePatch) {
                    nextState = applyStatePatch(nextState, data.statePatch);
                    console.log("State updated (edit):", nextState);

                    if (data.statePatch.events && data.statePatch.events.length > 0) {
                        const newEvents = data.statePatch.events.map((e: any) => ({
                            id: crypto.randomUUID(),
                            ...e
                        }));
                        const currentChronicle = get().chronicle || { events: [], chapters: [] };
                        set({ chronicle: { ...currentChronicle, events: [...currentChronicle.events, ...newEvents] } });
                    }
                }

                // 3. Add Assistant Node
                const finalTree = replyAssistant(nextTree, nextTree.headId, data.parts, nextState);
                set({ tree: finalTree });

                // Auto-save
                get().saveSession();
            } catch (error) {
                console.error(error);
            } finally {
                set({ isGenerating: false });
            }
        }
    },

    generateTitle: async () => {
        const { tree, currentSessionId } = get();
        if (!currentSessionId) return;

        try {
            const res = await fetch('/api/title', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree })
            });

            if (res.ok) {
                const { title } = await res.json();

                // Update local list state
                const sessions = get().sessions.map(s =>
                    s.id === currentSessionId ? { ...s, title } : s
                );

                set({ sessions });

                // Save session with new title
                get().saveSession();
            }
        } catch (error) {
            console.error("Failed to generate title", error);
        }
    },

    renameSession: async (sessionId, newTitle) => {
        try {
            const res = await fetch(`/api/sessions/${sessionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });

            if (res.ok) {
                set((state) => ({
                    sessions: state.sessions.map((s) =>
                        s.id === sessionId ? { ...s, title: newTitle } : s
                    ),
                    // If current session is renamed, update tree not strictly necessary as it loads from file, 
                    // but good for consistency if we tracked title in store separately (we don't really, just in sessions list)
                }));
            }
        } catch (error) {
            console.error("Failed to rename session", error);
        }
    },

    deleteSession: async (sessionId) => {
        try {
            const res = await fetch(`/api/sessions/${sessionId}`, {
                method: 'DELETE',
            });

            if (res.ok) {
                set((state) => ({
                    sessions: state.sessions.filter((s) => s.id !== sessionId),
                }));
            }
        } catch (error) {
            console.error("Failed to delete session", error);
        }
    },
}));
