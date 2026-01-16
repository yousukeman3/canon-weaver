import { GEMINI_MODELS } from "@/lib/constants";
import { Canon, Chronicle, WorldState } from "@/lib/domain/schema";
import { GoogleGenAI, ThinkingLevel, type Content as geminiContent, Part as geminiPart } from "@google/genai";
import { z } from "zod";
import { ChatTree, Part, Role, getPathNodesFromHead } from "./chatTree";
import { CanonProposalSchema, LLMClient, LLMConfig, LLMReply, extractSystemPromptFromRoot } from "./common";
import { buildCurationSystemPrompt, buildCurationUserContext, buildExtractionSystemPrompt, buildNarrativeSystemPrompt } from "./prompts";
import { StatePatchSchema } from "./stateManager";

export type GeminiConfig = LLMConfig;
export type GeminiReply = LLMReply;

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

export const buildGeminiContentsFromTree = (tree: ChatTree, limit?: number, includeThoughts: boolean = false, latestState?: WorldState): geminiContent[] => {
    const nodes = getPathNodesFromHead(tree, { limit });

    // Filter out system
    const history = nodes.filter((node) => node.role !== "system");

    return history.map((node, index) => {
        const isLast = index === history.length - 1;

        // If it's the last node (User) and we have a state to inject
        if (isLast && latestState && node.role === 'user') {
            // Create a modified node content with State prepended
            const stateText = `\n\n# Current World State\n\`\`\`json\n${JSON.stringify(latestState, null, 2)}\n\`\`\`\n\n`;

            // Modify the parts manually here. 
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

export const createGeminiClient = (apiKey: string): LLMClient => {
    const genai = new GoogleGenAI({ apiKey });

    return {
        async generateFromTree(params: {
            tree: ChatTree,
            historyLimit?: number,
            config: GeminiConfig,
            context?: { canon?: Canon, chronicle?: Chronicle, state?: WorldState }
        }): Promise<GeminiReply> {

            const { tree, historyLimit, config, context } = params;

            // ==========================================
            // PASS 1: NARRATIVE GENERATION (Creative)
            // ==========================================
            const baseSystemPrompt = extractSystemPromptFromRoot(tree);
            const narrativeSystemPrompt = buildNarrativeSystemPrompt(baseSystemPrompt, context || {});

            const includeThoughts = config.includeThoughts ?? false;
            // Pass 1 Contents (Standard History)
            const narrativeContents = buildGeminiContentsFromTree(tree, historyLimit, includeThoughts, undefined);

            const narrativeRes = await genai.models.generateContent({
                model: config.model,
                config: {
                    systemInstruction: narrativeSystemPrompt,
                    temperature: config.temperature, // Use configured temp for creativity
                    topP: config.topP,
                    topK: config.topK,
                    maxOutputTokens: config.maxOutputTokens,
                    stopSequences: config.stopSequences,
                    presencePenalty: config.presencePenalty,
                    frequencyPenalty: config.frequencyPenalty,
                    thinkingConfig: includeThoughts ? {
                        thinkingLevel: config.thinkingLevel ?? ThinkingLevel.MEDIUM,
                        includeThoughts,
                    } : undefined,
                },
                contents: narrativeContents,
            });

            const generatedNarrative = narrativeRes.text || "";

            // ==========================================
            // PASS 2: STATE EXTRACTION (Logical/Strict)
            // ==========================================
            // We feed the history + the NEWLY generated narrative to the model to extract the state change.

            const extractionSystemPrompt = buildExtractionSystemPrompt(context || {});

            // Prepare contents for extraction: History + User Input + [NEW NARRATIVE]
            const extractionContents = [...narrativeContents];

            // Append the generated narrative as a model turn
            extractionContents.push({
                role: "model",
                parts: [{ text: generatedNarrative }]
            });

            // Append specific instruction for this turn
            extractionContents.push({
                role: "user",
                parts: [{ text: "Based on the above story segment, output the JSON StatePatch." }]
            });

            // Retry loop configuration
            const MAX_STATE_RETRIES = 1;
            let statePatch = {};

            for (let attempt = 1; attempt <= MAX_STATE_RETRIES; attempt++) {
                try {
                    console.log(`State Extraction Attempt ${attempt}/${MAX_STATE_RETRIES}`);

                    const extractionRes = await genai.models.generateContent({
                        model: GEMINI_MODELS.MAIN,
                        config: {
                            systemInstruction: extractionSystemPrompt,
                            temperature: 0.4, // Keep low for consistency
                            responseMimeType: "application/json",
                            responseSchema: z.toJSONSchema(StatePatchSchema, { target: "openapi-3.0" }),
                            maxOutputTokens: 8192,
                            tools: [
                                {
                                    codeExecution: {}
                                }
                            ],
                            thinkingConfig: {
                                thinkingLevel: ThinkingLevel.MEDIUM,
                                includeThoughts: true,
                            }
                        },
                        contents: extractionContents,
                    });

                    const rawJSON = extractionRes.text || "{}";
                    console.log("Extraction Raw JSON:", rawJSON);

                    const parsed = JSON.parse(rawJSON);

                    // Validate against Zod Schema to ensure structure is correct
                    const validation = StatePatchSchema.safeParse(parsed);

                    if (validation.success) {
                        statePatch = parsed;
                        break; // Success!
                    } else {
                        console.error(`State Validation Failed (Attempt ${attempt}):`, validation.error);
                    }
                } catch (e) {
                    console.error(`State Extraction Failed (Attempt ${attempt}):`, e);
                }
            }

            // Construct result
            const parts: Part[] = [{ kind: "text", text: generatedNarrative }];
            return {
                parts,
                rawText: generatedNarrative,
                statePatch
            };
        },

        async curateCanon(params: {
            context: { canon: Canon; chronicle: Chronicle; state: WorldState };
        }) {
            const { context } = params;

            const curationSystemPrompt = buildCurationSystemPrompt();
            const promptContent = buildCurationUserContext(context);

            const res = await genai.models.generateContent({
                model: GEMINI_MODELS.DETAILS,
                config: {
                    systemInstruction: curationSystemPrompt,
                    temperature: 0.1, // Low temp for analytical task
                    responseMimeType: "application/json",
                    responseSchema: z.toJSONSchema(CanonProposalSchema, { target: "openapi-3.0" }),
                    thinkingConfig: {
                        thinkingLevel: ThinkingLevel.MEDIUM,
                        includeThoughts: true,
                    }
                },
                contents: [{ role: "user", parts: [{ text: promptContent }] }]
            });

            const rawJSON = res.text || "{}";
            try {
                const parsed = JSON.parse(rawJSON);
                return parsed.proposals || []; // Return raw proposals
            } catch (e) {
                console.error("Canon Curation JSON Parse Error:", e);
                return [];
            }
        }
    };
};