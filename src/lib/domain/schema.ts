import { z } from 'zod';

// ==========================================
// Primitives
// ==========================================
export const EntityIdSchema = z.uuid().brand('EntityId');
export type EntityId = z.infer<typeof EntityIdSchema>;

export const CanonIdSchema = z.uuid().brand('CanonId');
export type CanonId = z.infer<typeof CanonIdSchema>;

export const TimestampSchema = z.iso.datetime(); // ISO 8601

// ==========================================
// 1. Canon (正典・設定)
// Principles: Immutable by LLM (mostly), Source of Truth
// ==========================================

export const WorldEntrySchema = z.object({
    id: CanonIdSchema,
    category: z.enum(['CHARACTER', 'LOCATION', 'ITEM', 'LORE', 'RULE', 'FACTION']),
    name: z.string(),
    description: z.string(),
    // Meta-data for RAG or categorization
    tags: z.array(z.string()).default([]),
    aliases: z.array(z.string()).default([]),
});

export const CanonSchema = z.object({
    entries: z.array(WorldEntrySchema),
    globalRules: z.array(z.string()).default([]),
});

export type Canon = z.infer<typeof CanonSchema>;


// ==========================================
// 2. Chronicle (年代記・履歴)
// Principles: Causal history, compressed logs
// ==========================================

export const ChronicleEventSchema = z.object({
    id: z.uuid(),
    timestamp: TimestampSchema,
    summary: z.string(),
    type: z.enum(['SCENE_START', 'SCENE_END', 'MAJOR_DECISION', 'COMBAT_RESULT', 'ACQUISITION', 'LOSS', 'NOTE']),
    relatedEntityIds: z.array(EntityIdSchema).default([]),
    chatNodeId: z.uuid().optional(),
});

export const ChronicleSchema = z.object({
    events: z.array(ChronicleEventSchema),
    chapters: z.array(z.object({
        id: z.uuid(),
        title: z.string(),
        summary: z.string(),
        eventIds: z.array(z.uuid()),
    })).default([]),
});

export type Chronicle = z.infer<typeof ChronicleSchema>;


// ==========================================
// 3. State (WorldState / 現在状態)
// Principles: Mutable by LLM, Snapshot of "Now"
// ==========================================

// --- Shared ---
export const LocationSchema = z.object({
    id: CanonIdSchema.optional(), // If in a known Canon location
    name: z.string(),             // Fallback label or specific room name
    detail: z.string().optional() // "Under the table", "Near the door"
});

// --- Entities ---
export const EntityStateSchema = z.object({
    id: EntityIdSchema,

    // Reference to Canon (Source of Truth)
    // If present, dynamic overrides apply. If absent, it's an ephemeral entity.
    canonId: CanonIdSchema.optional(),

    name: z.string(),

    // Dynamic properties
    // Location structured for stability
    location: LocationSchema,

    activity: z.string(), // "What they are doing"
    condition: z.string(),   // "Healthy", "Injured", "Joyful", etc.
    intent: z.string().optional(), // "What they plan to do next"

    relationToPlayer: z.string(),

    // Generic key-value for flexible RPG stats, changed to array for LLM compatibility
    attributes: z.array(z.object({
        key: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()])
    })).default([]),
});

// --- Goals & Threads ---
export const QuestStatusSchema = z.enum(['ACTIVE', 'COMPLETED', 'FAILED', 'PAUSED']);

export const QuestSchema = z.object({
    id: z.uuid(),
    label: z.string(),
    description: z.string().optional(), // Restored description
    status: QuestStatusSchema.default('ACTIVE'), // Restored status with default
    steps: z.array(z.object({
        description: z.string(),
        completed: z.boolean(),
    })).default([]), // Restored steps

    // Flexible attributes
    attributes: z.array(z.object({
        key: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()])
    })).default([]),
});

export type QuestState = z.infer<typeof QuestSchema>;

// --- Player ---
export const PlayerStateSchema = z.object({
    name: z.string().default("Player"),
    location: LocationSchema.default({ name: "Unknown" }),
    condition: z.string().default("Healthy"),
    activity: z.string().optional(),
    intent: z.string().optional(),

    // Arrays for tracking items and skills
    inventory: z.array(z.string()).default([]),
    capabilities: z.array(z.string()).default([]),

    attributes: z.array(z.object({
        key: z.string(),
        value: z.union([z.string(), z.number(), z.boolean()])
    })).default([]),
});

// --- Scene ---
export const SceneStateSchema = z.object({
    // Camera context
    location: LocationSchema,
    time: z.string(),       // "Morning", "Night", "Winter 1054", etc.
    weather: z.string().optional(),
    atmosphere: z.string().optional(), // "Tense", "Joyful", "Spooky"
});

export const ThreadSchema = z.object({
    id: z.uuid(),
    description: z.string(), // "Mystery of the Red Box", "Who killed X?"
    status: z.enum(['UNRESOLVED', 'RESOLVED', 'ABANDONED']),
});

export type ThreadState = z.infer<typeof ThreadSchema>;

// --- Root State ---
export const WorldStateSchema = z.object({
    scene: SceneStateSchema,
    player: PlayerStateSchema,

    // Entities dictionary converted to list for consistency with patch logic
    entities: z.array(EntityStateSchema).default([]),

    quests: z.array(QuestSchema).default([]),
    threads: z.array(ThreadSchema).default([]),

    // Facts: Established truths of the current context
    facts: z.array(z.string()).default([]),

    // Hypotheses: Speculations, potential future events, or hidden plots (Narrator context)
    hypotheses: z.array(z.string()).default([]),

    // Secrets: Explicitly hidden info (legacy field kept if needed, or merged into hypotheses with tags)
    secrets: z.array(z.string()).default([]),
});

export type WorldState = z.infer<typeof WorldStateSchema>;
export type EntityState = z.infer<typeof EntityStateSchema>;
export type PlayerState = z.infer<typeof PlayerStateSchema>;

export const DEFAULT_WORLD_STATE: WorldState = {
    scene: {
        location: { name: "Unknown" },
        time: "Start of Adventure"
    },
    player: {
        name: "Player",
        location: { name: "Unknown" },
        condition: "Healthy",
        inventory: [],
        capabilities: [],
        attributes: []
    },
    entities: [],
    quests: [],
    threads: [],
    facts: [],
    hypotheses: [],
    secrets: []
};


// ==========================================
// 4. Combined Context
// ==========================================
export const GameContextSchema = z.object({
    canon: CanonSchema,
    chronicle: ChronicleSchema,
    state: WorldStateSchema,
});
