import { API_ENDPOINTS } from "@/lib/constants";
import { DEFAULT_WORLD_STATE, WorldState } from "@/lib/domain/schema";
import { ChatNode, ChatNodeId } from '@/lib/llm/chatTree';
import { migrateState } from "@/lib/llm/stateManager";
import { toast } from "sonner";
import { CanonSlice, StoreSlice } from "../types";

export const createCanonSlice: StoreSlice<CanonSlice> = (set, get) => ({
    canon: undefined,
    chronicle: undefined,
    canonDrafts: [],
    isCurating: false,

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

    runCuration: async () => {
        const { tree, canon, chronicle } = get();
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
            const response = await fetch(API_ENDPOINTS.CURATE, {
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
            toast.error("Curation failed");
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
            toast.success("New entry created from draft");
        } else if (draft.type === 'UPDATE' && draft.targetCanonId) {
            // Update existing entry
            nextCanon.entries = nextCanon.entries.map(e => {
                if (e.id === draft.targetCanonId) {
                    return { ...e, ...draft.entry, id: e.id }; // Merge new content but keep ID
                }
                return e;
            });
            toast.success("Entry updated from draft");
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
        toast.info("Draft rejected");
    },

    addCanonEntry: async (entry) => {
        const { canon } = get();
        let nextCanon = canon ? { ...canon } : { entries: [], globalRules: [] };
        if (!nextCanon.entries) nextCanon.entries = [];

        const newEntry = {
            ...entry,
            id: crypto.randomUUID() as any,
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

            const res = await fetch(API_ENDPOINTS.CHRONICLE_CHAPTER, {
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
            toast.error("Failed to wrap up chapter");
        }
    },
});
