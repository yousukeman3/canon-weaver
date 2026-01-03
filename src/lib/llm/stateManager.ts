import { EntityId, EntityState, QuestSchema, QuestState, ThreadSchema, ThreadState, WorldState } from "@/lib/domain/schema";
import { z } from "zod";

export const StatePatchSchema = z.object({
    // Scene: REQUIRED. Always strictly track the current scene context.
    scene: z.object({
        time: z.string().describe("現在のゲーム内時間（例: '夜', '12:00'）。"),
        location: z.object({
            name: z.string().describe("現在の場所の名前。"),
            detail: z.string().optional().describe("場所の詳細や特定のサブエリア。")
        }),
        atmosphere: z.string().optional().describe("現在の雰囲気やムード（例: '緊張感', '霧が立ち込めている'）。")
    }),

    // Player: REQUIRED. Always strictly track the player's basic state.
    player: z.object({
        condition: z.string().describe("プレイヤーの状態（例: '健康', '疲労', '負傷'）。"),
        location: z.object({
            name: z.string().describe("現在の場所（通常はシーンと同じ場所名、またはより具体的な地点）。"),
            detail: z.string().optional()
        }),
        inventory: z.object({
            add: z.array(z.string()).optional().describe("新規に入手したアイテムのリスト。"),
            remove: z.array(z.string()).optional().describe("失ったアイテムのリスト。"),
        }).optional(),
        capabilities: z.object({
            add: z.array(z.string()).optional().describe("新規に獲得したスキルや能力。"),
            remove: z.array(z.string()).optional().describe("失ったスキルや能力。"),
        }).optional(),
        attributes: z.array(z.object({
            key: z.string(),
            value: z.union([z.string(), z.number(), z.boolean()])
        })).optional().describe("カスタムステータスの更新（例: 'HP: 10'）。")
    }),

    // Entities: STRICTER schema. If you update an entity, you MUST provide its core state.
    // This prevents "empty" updates and forcing the model to think about these fields stabilizes output.
    entities: z.array(z.object({
        id: z.string().describe("エンティティのUUID。新規の場合は新しいUUIDを生成。"),
        name: z.string().optional().describe("エンティティの名前（新規の場合は必須）。"),

        // Critical State Fields - Made REQUIRED for stability if the entity is included in the patch
        condition: z.string().optional().describe("現在の状態（例: '負傷', '多忙'）。 同じ言葉を繰り返してはいけない。"),
        activity: z.string().optional().describe("現在の行動（例: '戦っている', '話している'）。"),
        relationToPlayer: z.string().optional().describe("プレイヤーとの関係性（例: '友好的', '敵対的'）。"),

        location: z.object({
            name: z.string().optional(),
            detail: z.string().optional()
        }).optional(),

        attributes: z.array(z.object({
            key: z.string(),
            value: z.union([z.string(), z.number(), z.boolean()])
        })).optional().describe("エンティティ固有のステータス。"),

        deleted: z.boolean().optional().describe("死亡、消滅、または物語から退場して無関係になった場合にTRUEを設定。")
    })).optional(),

    // Lists (Keep optional as they are less frequent)
    quests: z.array(QuestSchema.partial().required({ id: true })).optional().describe("プレイヤーが正式に受注した明確な目的やミッション（例: '王子を救出する'）。"),
    threads: z.array(ThreadSchema.partial().required({ id: true })).optional().describe("物語の伏線、謎、未解決の気掛かり（例: '奇妙なシンボルを発見した', '赤い服の男について'）。"),

    facts: z.object({
        add: z.array(z.string()).optional().describe("新しく判明した事実。"),
        remove: z.array(z.string()).optional().describe("否定された、または古くなった事実。"),
    }).optional(),

    hypotheses: z.object({
        add: z.array(z.string()).optional().describe("新しい推測や仮説。"),
        remove: z.array(z.string()).optional().describe("解決済み、または否定された仮説。"),
    }).optional(),

    secrets: z.object({
        add: z.array(z.string()).optional().describe("新しく判明した秘密。"),
        remove: z.array(z.string()).optional().describe("露見した秘密。"),
    }).optional(),

    // Chronicle Events: New events to append to history
    events: z.array(z.object({
        summary: z.string().describe("イベントの簡潔な要約（例: '王に謁見した', 'ドラゴンを倒した'）。"),
        type: z.enum(['SCENE_START', 'SCENE_END', 'MAJOR_DECISION', 'COMBAT_RESULT', 'ACQUISITION', 'LOSS', 'NOTE']).describe("イベントの種類。"),
        timestamp: z.string().describe("イベント発生時のゲーム内時間。"),
        relatedEntityIds: z.array(z.string()).optional().describe("関連するエンティティのIDリスト。")
    })).optional().describe("このターンで発生した重要なイベント。特になければ省略可。")
});

export type StatePatch = z.infer<typeof StatePatchSchema>;

/**
 * Applies a partial state patch to the current world state.
 * - Entities: Merge by ID.
 * - Quests & Threads: Upsert by ID (Merge if exists, Add if new).
 * - Facts, Hypotheses, Secrets: Add/Remove strings.
 */
export const applyStatePatch = (currentState: WorldState, patch: StatePatch): WorldState => {
    const nextState = { ...currentState };

    // --- Scene (Required in Schema, effectively key-overwrite) ---
    if (patch.scene) {
        nextState.scene = {
            ...nextState.scene,
            ...patch.scene,
            location: {
                ...nextState.scene.location,
                ...patch.scene.location
            }
        };
    }

    // --- Player ---
    if (patch.player) {
        const p = patch.player;
        nextState.player = {
            ...nextState.player,
            // Clean up the patch-specific fields before spreading (though key intersection is minimal/handled below)
        };

        // Handle nested merges (Location is required in patch now)
        nextState.player.location = {
            ...nextState.player.location,
            ...p.location
        };

        if (p.inventory) {
            const current = new Set(nextState.player.inventory);
            p.inventory.remove?.forEach(i => current.delete(i));
            p.inventory.add?.forEach(i => current.add(i));
            nextState.player.inventory = Array.from(current);
        }

        if (p.capabilities) {
            const current = new Set(nextState.player.capabilities);
            p.capabilities.remove?.forEach(c => current.delete(c));
            p.capabilities.add?.forEach(c => current.add(c));
            nextState.player.capabilities = Array.from(current);
        }

        if (p.attributes) {
            nextState.player.attributes = [
                ...nextState.player.attributes.filter(a => !p.attributes?.some(newAttr => newAttr.key === a.key)),
                ...(p.attributes || [])
            ];
        }

        // Cleanup types (since patch schema has {add,remove} but state schema has string[])
        // The spread above might have assigned {add,remove} to inventory/capabilities which is wrong type-wise at runtime if we aren't careful,
        // but since we overwrite them immediately after, it's fine. 
        // Ideally we shouldn't spread `p` directly if it has incompatible types.
        // Let's be explicit to avoid "inventory: {add: ...}" ending in state if we missed something.
        const { inventory, capabilities, attributes, location, ...scalars } = p;
        Object.assign(nextState.player, scalars);
    }

    // --- Entities ---
    if (patch.entities) {
        // Ensure entities array exists
        const currentEntities = nextState.entities || [];
        const entMap = new Map(currentEntities.map(e => [e.id, e]));

        for (const entityPatch of patch.entities) {
            const id = entityPatch.id as EntityId;
            if (!id) continue; // Ensure ID is present for patching

            if (entityPatch.deleted) {
                // EXPLICIT DELETION
                if (entMap.has(id)) {
                    entMap.delete(id);
                    console.log(`[State] Entity deleted: ${id}`);
                }
                continue;
            }

            if (entMap.has(id)) {
                // UPDATE
                const existing = entMap.get(id)!;
                entMap.set(id, {
                    ...existing,
                    ...entityPatch,
                    location: {
                        ...existing.location,
                        ...(entityPatch.location || {})
                    },
                    attributes: [
                        ...existing.attributes.filter(a => !entityPatch.attributes?.some(p => p.key === a.key)),
                        ...(entityPatch.attributes || [])
                    ]
                } as EntityState);
                console.log(`[State] Entity updated: ${id} (${existing.name})`);
            } else {
                // CREATE
                // Allow creation even if name is missing (fallback to Unknown/ID) to prevent data loss
                const name = entityPatch.name || "Unknown Entity";

                const baseLocation = { name: "Unknown" };
                const mergedLocation = { ...baseLocation, ...(entityPatch.location || {}) };

                entMap.set(id, {
                    attributes: [],
                    ...entityPatch,
                    name,
                    location: mergedLocation,
                    condition: entityPatch.condition || "Unknown",
                    activity: entityPatch.activity || "New",
                    relationToPlayer: entityPatch.relationToPlayer || "Neutral"
                } as EntityState);
                console.log(`[State] New Entity created: ${id} (${name})`);
            }
        }
        nextState.entities = Array.from(entMap.values());
    }

    // --- Quests (Upsert) ---
    if (patch.quests) {
        const map = new Map(nextState.quests.map(q => [q.id, q]));
        for (const q of patch.quests) {
            if (map.has(q.id)) {
                map.set(q.id, {
                    ...map.get(q.id)!,
                    ...q,
                    // Merge steps if provided
                    steps: q.steps || map.get(q.id)!.steps
                } as QuestState);
            } else {
                if (q.label && q.status) { // Basic validation for new
                    map.set(q.id, q as QuestState);
                }
            }
        }
        nextState.quests = Array.from(map.values());
    }

    // --- Threads (Upsert) ---
    if (patch.threads) {
        const map = new Map(nextState.threads.map(t => [t.id, t]));
        for (const t of patch.threads) {
            if (map.has(t.id)) {
                map.set(t.id, { ...map.get(t.id)!, ...t } as ThreadState);
            } else {
                if (t.description) map.set(t.id, t as ThreadState);
            }
        }
        nextState.threads = Array.from(map.values());
    }

    // --- Facts (Add/Remove) ---
    if (patch.facts) {
        let list = [...currentState.facts];
        if (patch.facts.add && patch.facts.add.length > 0) {
            // Avoid duplicates
            const newItems = patch.facts.add.filter(item => !list.includes(item));
            list.push(...newItems);
        }
        if (patch.facts.remove && patch.facts.remove.length > 0) {
            list = list.filter(item => !patch.facts?.remove?.includes(item));
        }
        nextState.facts = list;
    }

    // --- Hypotheses (Add/Remove) ---
    if (patch.hypotheses) {
        let list = [...currentState.hypotheses];
        if (patch.hypotheses.add) {
            const newItems = patch.hypotheses.add.filter(item => !list.includes(item));
            list.push(...newItems);
        }
        if (patch.hypotheses.remove) {
            list = list.filter(item => !patch.hypotheses?.remove?.includes(item));
        }
        nextState.hypotheses = list;
    }

    // --- Secrets (Add/Remove) ---
    if (patch.secrets) {
        let list = [...currentState.secrets];
        if (patch.secrets.add) {
            const newItems = patch.secrets.add.filter(item => !list.includes(item));
            list.push(...newItems);
        }
        if (patch.secrets.remove) {
            list = list.filter(item => !patch.secrets?.remove?.includes(item));
        }
        nextState.secrets = list;
    }

    return nextState;
};

/**
 * Migrates a potential legacy state object to the current schema.
 * Handles renaming 'status' -> 'condition' (Player/Entity) and 'title' -> 'label' (Quest).
 */
export const migrateState = (state: any): WorldState => {
    if (!state) return state;

    const nextState = { ...state };

    // Migrate Player
    if (nextState.player) {
        if (nextState.player.status && !nextState.player.condition) {
            nextState.player.condition = nextState.player.status;
            delete nextState.player.status;
        }
    }

    // Migrate Entities
    if (nextState.entities && Array.isArray(nextState.entities)) {
        nextState.entities = nextState.entities.map((ent: any) => {
            const newEnt = { ...ent };
            if (newEnt.status && !newEnt.condition) {
                newEnt.condition = newEnt.status;
                delete newEnt.status;
            }
            return newEnt;
        });
    }

    // Migrate Quests (title -> label)
    if (nextState.quests && Array.isArray(nextState.quests)) {
        nextState.quests = nextState.quests.map((q: any) => {
            const newQ = { ...q };
            if (newQ.title && !newQ.label) {
                newQ.label = newQ.title;
                delete newQ.title;
            }
            return newQ;
        });
    }

    return nextState as WorldState;
};
