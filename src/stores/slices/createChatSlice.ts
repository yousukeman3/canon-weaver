import { DEFAULT_WORLD_STATE, WorldState } from "@/lib/domain/schema";
import {
    appendUser,
    ChatNode,
    ChatNodeId,
    createEmptyTree,
    getAlternatives,
    regenerateAssistant,
    replyAssistant,
    rewriteNode,
    setActive,
    setHead
} from '@/lib/llm/chatTree';
import { applyStatePatch, migrateState } from "@/lib/llm/stateManager";
import { ChatSlice, StoreSlice } from "../types";

import { API_ENDPOINTS, DEFAULT_GEMINI_CONFIG, DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import { toast } from "sonner";

export const createChatSlice: StoreSlice<ChatSlice> = (set, get) => ({
    tree: createEmptyTree(DEFAULT_SYSTEM_PROMPT),
    isGenerating: false,
    config: DEFAULT_GEMINI_CONFIG,

    initialize: () => {
        get().loadSessions();
    },

    updateConfig: (newConfig) => set((state) => ({ config: { ...state.config, ...newConfig } })),

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

    sendMessage: async (text) => {
        const { tree, config, canon, chronicle } = get();

        // 1. Add User Node
        const nextTree = appendUser(tree, text);
        set({ tree: nextTree, isGenerating: true });

        // Calculate latest state to trigger context
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
            const response = await fetch(API_ENDPOINTS.CHAT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tree: nextTree,
                    config,
                    context: {
                        canon: canon,
                        chronicle: chronicle,
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
            const sessionTitle = get().sessions.find(s => s.id === get().currentSessionId)?.title;
            const nodeCount = Object.keys(finalTree.nodes).length;

            if (sessionTitle === "New Chat" && nodeCount <= 6) {
                get().generateTitle();
            }

        } catch (error) {
            console.error(error);
            toast.error("Failed to generate response. Check configuration.");
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

            // Calculate state at parent level
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

            const response = await fetch(API_ENDPOINTS.CHAT, {
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
            toast.error("Failed to regenerate response.");
        } finally {
            set({ isGenerating: false });
        }
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
                const response = await fetch(API_ENDPOINTS.CHAT, {
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
                toast.error("Failed to generate response for edit.");
            } finally {
                set({ isGenerating: false });
            }
        }
    },
});
