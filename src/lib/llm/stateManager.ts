import { EntityStateSchema, QuestSchema, ThreadSchema, WorldState, WorldStateSchema } from "@/lib/domain/schema";
import { z } from "zod";

export const StatePatchSchema = z.object({
    scene: WorldStateSchema.shape.scene.partial().optional(),
    entities: z.record(z.string(), EntityStateSchema.partial()).optional(),
    quests: z.array(QuestSchema).optional(),
    threads: z.array(ThreadSchema).optional(),
    facts: z.array(z.string()).optional(),
    hypotheses: z.array(z.string()).optional(),
    secrets: z.array(z.string()).optional(),
});

export type StatePatch = z.infer<typeof StatePatchSchema>;

/**
 * Applies a partial state patch to the current world state.
 * Arrays are replaced if provided, Objects are merged.
 */
export const applyStatePatch = (currentState: WorldState, patch: StatePatch): WorldState => {
    const nextState = { ...currentState };

    if (patch.scene) {
        nextState.scene = {
            ...currentState.scene,
            ...patch.scene,
            location: {
                ...currentState.scene.location,
                ...(patch.scene.location || {})
            }
        };
    }

    if (patch.entities) {
        nextState.entities = { ...currentState.entities };
        for (const [key, entityPatch] of Object.entries(patch.entities)) {
            // Check if entityPatch is undefined (shouldn't be with Zod, but safe to check)
            if (!entityPatch) continue;

            const id = key as any; // Cast to EntityId
            const existing = nextState.entities[id];

            if (existing) {
                // Merge existing
                nextState.entities[id] = {
                    ...existing,
                    ...entityPatch,
                    location: {
                        ...existing.location,
                        ...(entityPatch.location || {})
                    },
                    attributes: {
                        ...existing.attributes,
                        ...(entityPatch.attributes || {})
                    }
                } as any;
            } else {
                // Create new if likely sufficient
                if (entityPatch.name && entityPatch.location && entityPatch.activity && entityPatch.status) {
                    nextState.entities[id] = entityPatch as any;
                }
            }
        }
    }

    if (patch.quests) nextState.quests = patch.quests;
    if (patch.threads) nextState.threads = patch.threads;
    if (patch.facts) nextState.facts = patch.facts;
    if (patch.hypotheses) nextState.hypotheses = patch.hypotheses;
    if (patch.secrets) nextState.secrets = patch.secrets;

    return nextState;
};
