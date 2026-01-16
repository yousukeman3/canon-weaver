import { Canon, CanonIdSchema, Chronicle, WorldEntrySchema, WorldState } from "@/lib/domain/schema";
import { StatePatchSchema } from "@/lib/llm/stateManager";
import { z } from "zod";
import { ChatTree, Part } from "./chatTree";

// ==========================================
// Schemas
// ==========================================

export const StoryResponseSchema = z.object({
    narrative: z.string().describe("The story text, roleplay response, or description."),
    // thoughts: z.string().optional().describe("Internal reasoning."),
    state_patch: StatePatchSchema.describe("Updates to the world state entities, scene, quests, etc. Must be provided, even if empty."),
});

export const CanonProposalSchema = z.object({
    proposals: z.array(z.object({
        type: z.enum(['CREATE', 'UPDATE']),
        targetCanonId: CanonIdSchema.optional().describe("If UPDATE, provide the existing Canon ID."),
        entry: WorldEntrySchema.omit({ id: true }).describe("The content of the entry. For UPDATE, this represents the *merged* final state of the entry."),
        reason: z.string().describe("Why is this being proposed? e.g. 'Player met new NPC', 'Revealed true identity'."),
    }))
});

// ==========================================
// Types
// ==========================================

export type LLMConfig = {
    model: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    // thinkingLevel?: ThinkingLevel; // Specific to Gemini, can keep in "extra" or specific config
    includeThoughts?: boolean;
    presencePenalty?: number;
    frequencyPenalty?: number;
    [key: string]: any; // Allow provider-specific extensions
};

export type LLMReply = {
    parts: Part[];
    rawText: string;
    statePatch?: any;
};

export interface LLMClient {
    generateFromTree(params: {
        tree: ChatTree,
        historyLimit?: number,
        config: LLMConfig,
        context?: { canon?: Canon, chronicle?: Chronicle, state?: WorldState }
    }): Promise<LLMReply>;

    curateCanon(params: {
        context: { canon: Canon; chronicle: Chronicle; state: WorldState };
    }): Promise<CanonProposal[]>;
}

export type CanonProposal = z.infer<typeof CanonProposalSchema>;

// ==========================================
// Utilities
// ==========================================

export const extractSystemPromptFromRoot = (tree: ChatTree): string => {
    const root = tree.nodes[tree.rootId];
    if (!root) {
        throw new Error("Root node does not exist");
    }
    if (root.role !== "system") {
        throw new Error("Root node must be system");
    }
    return root.parts.filter((part) => part.kind === "text").map((part) => part.text).join("\n");
};
