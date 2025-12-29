import { Canon, Chronicle, WorldState } from "@/lib/domain/schema";
import { GoogleGenAI, ThinkingLevel, type Content as geminiContent, Part as geminiPart } from "@google/genai";
import { z } from "zod";
import { zodToJsonSchema } from "zod-to-json-schema";
import { ChatTree, Part, Role, getPathNodesFromHead } from "./chatTree";
import { StatePatchSchema } from "./stateManager";

export type GeminiConfig = {
    model: string;
    temperature?: number;
    topP?: number;
    topK?: number;
    maxOutputTokens?: number;
    stopSequences?: string[];
    thinkingLevel?: ThinkingLevel;
    includeThoughts?: boolean;
};

export type GeminiReply = {
    parts: Part[];
    rawText: string;
    statePatch?: any; // Raw JSON patch
};

const roleToGemini = (role: Role): "user" | "model" => {
    if (role === "user") return "user";
    if (role === "assistant") return "model";
    if (role === "system") throw new Error("Don't assign system role to this function");
    throw new Error(`Unknown role: ${role}`);
};

const partsToGemini = (parts: Part[], includeThoughts: boolean = false): geminiPart[] => {
    return parts.filter((part) => part.kind === "text" || (includeThoughts && part.kind === "thought")).map((part) => {
        if (part.kind === "thought") {
            return {
                thought: true,
                text: part.thought,
            };
        } else if (part.kind === "text") {
            return {
                text: part.text,
            };
        } else {
            throw new Error(`Unsupported part kind: ${part.kind}`);
        }
    });
};

const geminiToParts = (parts: geminiPart[]): Part[] => {
    return parts.filter((part) => (typeof part.text === "string" && part.text.length > 0) || part.thought).map((part) => {
        if (part.thought) {
            return {
                kind: "thought",
                thought: part.text!,
            };
        } else {
            return {
                kind: "text",
                text: part.text!,
            };
        }
    });
};

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

export const buildGeminiContentsFromTree = (tree: ChatTree, limit?: number, includeThoughts: boolean = false, latestState?: WorldState): geminiContent[] => {
    const nodes = getPathNodesFromHead(tree, { limit });

    // Inject state into the relevant position (before the last user message, or at the end if we are about to reply?)
    // Actually, usually we append the *latest known state* before the conversation segment or as a special context block.
    // Let's inject it as a "developer" or "user" block at the start of the history, or just prepend to the last user message?
    // Prepending to the last user message is robust.

    // Filter out system
    const history = nodes.filter((node) => node.role !== "system");

    return history.map((node, index) => {
        const isLast = index === history.length - 1;

        // If it's the last node (User) and we have a state to inject
        if (isLast && latestState && node.role === 'user') {
            // Create a modified node content with State prepended
            const stateText = `\n\n# Current World State\n\`\`\`json\n${JSON.stringify(latestState, null, 2)}\n\`\`\`\n\n`;

            // Modify the parts manually here. 
            // BEWARE: This assumes the last node IS a user node (which is typical for generate loop).
            const originalParts = partsToGemini(node.parts, includeThoughts);

            // Prepend text part
            const parts = [
                { text: stateText },
                ...originalParts
            ];
            return { role: "user", parts };
        }

        return { role: roleToGemini(node.role), parts: partsToGemini(node.parts, includeThoughts) };
    });
};

const UPDATE_STATE_TOOL_NAME = "update_world_state";

const StoryResponseSchema = z.object({
    narrative: z.string().describe("The story text, roleplay response, or description."),
    // thoughts: z.string().optional().describe("Internal reasoning."), // Optional, if we want to capture it separately
    state_patch: StatePatchSchema.optional().describe("Updates to the world state entities, scene, quests, etc."),
});

export const createGeminiClient = (apiKey: string) => {
    const genai = new GoogleGenAI({ apiKey });

    // Generate schema for the entire response
    const jsonSchema = zodToJsonSchema(StoryResponseSchema as any, { target: "openApi3" });

    // We don't need tools anymore if we use responseSchema for the WHOLE output
    // But we might want tools for *other* things?
    // For now, let's assume the user wants the "Forced Structure" approach for the main interaction.

    return {
        async generateFromTree(params: {
            tree: ChatTree,
            historyLimit?: number,
            config: GeminiConfig,
            context?: { canon?: Canon, chronicle?: Chronicle, state?: WorldState }
        }): Promise<GeminiReply> {
            const { tree, historyLimit, config, context } = params;

            let systemPrompt = extractSystemPromptFromRoot(tree);

            // Append Canon/Chronicle to System Prompt
            if (context?.canon) {
                systemPrompt += `\n\n# Canon (World Setting)\n${JSON.stringify(context.canon, null, 2)}`;
            }
            if (context?.chronicle) {
                systemPrompt += `\n\n# Chronicle (History)\n${JSON.stringify(context.chronicle, null, 2)}`;
            }

            systemPrompt += `\n\nIMPORTANT: You must respond in valid JSON matching the schema. The 'narrative' field contains your main response. The 'state_patch' field contains any updates to the world state.`;

            const includeThoughts = config.includeThoughts ?? false;
            const contents = buildGeminiContentsFromTree(tree, historyLimit, includeThoughts, context?.state);

            // console.log("System Prompt Length:", systemPrompt.length);
            // console.log("Contents:", JSON.stringify(contents, null, 2));

            const res = await genai.models.generateContent(
                {
                    model: config.model,
                    config: {
                        systemInstruction: systemPrompt,
                        temperature: config.temperature,
                        topP: config.topP,
                        topK: config.topK,
                        maxOutputTokens: config.maxOutputTokens,
                        stopSequences: config.stopSequences,
                        // thinkingConfig: ... (Thinking models might clash with JSON mode? usually fine)
                        thinkingConfig: includeThoughts ? {
                            thinkingLevel: config.thinkingLevel ?? ThinkingLevel.MEDIUM,
                            includeThoughts,
                        } : undefined,
                        responseMimeType: "application/json",
                        responseSchema: jsonSchema,
                    },
                    contents,
                }
            );

            const rawText = res.text ?? "{}";
            let parsed: any = {};
            try {
                parsed = JSON.parse(rawText);
            } catch (e) {
                console.error("Failed to parse LLM JSON:", rawText);
                // Fallback: treat whole text as narrative if parse fails (unlikely with forced schema)
                return {
                    parts: [{ kind: "text", text: rawText }],
                    rawText,
                };
            }

            const narrative = parsed.narrative || "";
            const statePatch = parsed.state_patch;

            // Reconstruct parts
            const parts: Part[] = [{ kind: "text", text: narrative }];

            return {
                parts,
                rawText: narrative, // The rawText for the UI is the narrative. The JSON is hidden.
                statePatch
            }
        }
    }
};