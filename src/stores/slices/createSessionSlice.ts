import { ChatNode, ChatNodeId, createEmptyTree } from '@/lib/llm/chatTree';
import { migrateState } from "@/lib/llm/stateManager";
import { ChatSession } from '@/lib/persistence';
import { SessionSlice, StoreSlice } from "../types";

import { API_ENDPOINTS, DEFAULT_SYSTEM_PROMPT } from "@/lib/constants";
import { toast } from "sonner";

export const createSessionSlice: StoreSlice<SessionSlice> = (set, get) => ({
    currentSessionId: null,
    sessions: [],
    isSessionLoading: false,

    loadSessions: async () => {
        try {
            const res = await fetch(API_ENDPOINTS.SESSIONS);
            if (res.ok) {
                const sessions = await res.json();
                set({ sessions });
            }
        } catch (error) {
            console.error("Failed to load sessions", error);
            toast.error("Failed to load sessions");
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
            const res = await fetch(API_ENDPOINTS.SESSIONS, {
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
            toast.error("Failed to create session");
        }
    },

    loadSession: async (sessionId) => {
        if (sessionId === get().currentSessionId) return;

        set({ isSessionLoading: true });
        try {
            const res = await fetch(API_ENDPOINTS.SESSION_DETAIL(sessionId));
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
                });
            }
        } catch (error) {
            console.error("Failed to load session", error);
            toast.error("Failed to load session");
        } finally {
            set({ isSessionLoading: false });
        }
    },

    saveSession: async () => {
        const { currentSessionId, tree, config, canon, chronicle } = get();
        if (!currentSessionId) return; // Cannot save if not in a session

        const currentSession = get().sessions.find(s => s.id === currentSessionId);
        const title = currentSession?.title || "New Chat";

        const now = new Date().toISOString();
        const session: ChatSession = {
            id: currentSessionId,
            title,
            createdAt: now, // Ideally keep original, but simpler for now
            updatedAt: now,
            tree,
            config,
            systemPrompt: DEFAULT_SYSTEM_PROMPT,
            canon,
            chronicle
        };

        try {
            await fetch(API_ENDPOINTS.SESSION_DETAIL(currentSessionId), {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(session)
            });
            // Update list timestamp
            get().loadSessions();
        } catch (error) {
            console.error("Failed to save session", error);
            toast.error("Failed to save session");
        }
    },

    generateTitle: async () => {
        const { tree, currentSessionId } = get();
        if (!currentSessionId) return;

        try {
            const res = await fetch(API_ENDPOINTS.TITLE_GEN, {
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
            // Silent error for title generation
        }
    },

    renameSession: async (sessionId, newTitle) => {
        try {
            const res = await fetch(API_ENDPOINTS.SESSION_DETAIL(sessionId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title: newTitle })
            });

            if (res.ok) {
                set((state) => ({
                    sessions: state.sessions.map((s) =>
                        s.id === sessionId ? { ...s, title: newTitle } : s
                    ),
                }));
            }
        } catch (error) {
            console.error("Failed to rename session", error);
            toast.error("Failed to rename session");
        }
    },

    deleteSession: async (sessionId) => {
        try {
            const res = await fetch(API_ENDPOINTS.SESSION_DETAIL(sessionId), {
                method: 'DELETE',
            });

            if (res.ok) {
                set((state) => ({
                    sessions: state.sessions.filter((s) => s.id !== sessionId),
                }));
            }
        } catch (error) {
            console.error("Failed to delete session", error);
            toast.error("Failed to delete session");
        }
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
});
