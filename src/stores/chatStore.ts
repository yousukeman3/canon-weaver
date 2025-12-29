import { Canon, Chronicle, DEFAULT_WORLD_STATE, WorldState } from "@/lib/domain/schema";
import {
    ChatNodeId,
    ChatTree,
    appendUser,
    createEmptyTree,
    getAlternatives,
    regenerateAssistant,
    replyAssistant,
    rewriteNode,
    setActive,
    setHead,
} from '@/lib/llm/chatTree';
import { GeminiConfig } from '@/lib/llm/gemini';
import { applyStatePatch } from "@/lib/llm/stateManager";
import { ChatSession, ChatSessionMetadata } from '@/lib/persistence';
import { ThinkingLevel } from '@google/genai';
import { create } from 'zustand';

const DEFAULT_SYSTEM_PROMPT = `You are a creative roleplay partner. Write in a vivid, engaging style.`;

interface ChatState {
    tree: ChatTree;
    isGenerating: boolean;
    sidebarOpen: boolean;
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
}

export const useChatStore = create<ChatState>((set, get) => ({
    tree: createEmptyTree(DEFAULT_SYSTEM_PROMPT),
    isGenerating: false,
    sidebarOpen: true,
    config: {
        model: "gemini-3-flash-preview",
        temperature: 0.9,
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
        const { config, canon, chronicle } = get();
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
            canon,
            chronicle
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
                currentState = node.state;
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
        const { tree, config } = get();
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

            const tempTree = setHead(tree, parentId);

            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ tree: tempTree, config }),
            });

            if (!response.ok) throw new Error('API request failed');
            const data = await response.json();

            // Add as sibling (regenerate)
            const finalTree = regenerateAssistant(tree, targetId, data.parts);
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
        const { tree, config } = get();
        const node = tree.nodes[nodeId];

        if (!node) return;

        // 1. Rewrite Node (Create sibling)
        const nextTree = rewriteNode(tree, nodeId, [{ kind: 'text', text: newText }]);
        set({ tree: nextTree });

        // 2. If User, auto-generate response
        if (node.role === 'user') {
            set({ isGenerating: true });

            try {
                const response = await fetch('/api/chat', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ tree: nextTree, config }),
                });

                if (!response.ok) throw new Error('API request failed');
                const data = await response.json();

                // 3. Add Assistant Node
                const finalTree = replyAssistant(nextTree, nextTree.headId, data.parts);
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
