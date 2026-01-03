import { Canon, CanonIdSchema, Chronicle, WorldEntrySchema, WorldState } from "@/lib/domain/schema";
import { GoogleGenAI, ThinkingLevel, type Content as geminiContent, Part as geminiPart } from "@google/genai";
import { z } from "zod";
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
    presencePenalty?: number;
    frequencyPenalty?: number;
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
    state_patch: StatePatchSchema.describe("Updates to the world state entities, scene, quests, etc. Must be provided, even if empty."),
});

export const createGeminiClient = (apiKey: string) => {
    const genai = new GoogleGenAI({ apiKey });

    // Generate schema for the entire response
    const jsonSchema = z.toJSONSchema(StoryResponseSchema, { target: "openapi-3.0" });

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

            // ==========================================
            // PASS 1: NARRATIVE GENERATION (Creative)
            // ==========================================
            let narrativeSystemPrompt = extractSystemPromptFromRoot(tree);

            // Extract Player Name for clarity
            const playerName = context?.state?.player?.name || "Player";

            // Append Context for Narrative
            if (context?.canon) {
                const { globalRules, ...restCanon } = context.canon;
                if (globalRules && globalRules.length > 0) {
                    narrativeSystemPrompt += `\n\n# World Rules (Important)\n${globalRules.map(r => `- ${r}`).join('\n')}`;
                }

                // REVISED CANON INJECTION: GM TRUTHS
                narrativeSystemPrompt += `
\n# World Truths (Canon) - FOR GM EYES ONLY
The following is the absolute truth of the world.
IMPORTANT: The Player (User) likely DOES NOT KNOW everything here.

${JSON.stringify(restCanon, null, 2)}

## Rules for Using Canon Information:
1. **Knowledge Separation (Common Knowledge vs. Secrets)**:
   - **Common Knowledge**: Facts that a resident of the world would reasonably know (Geography, Public Figures, History) can be revealed freely to provide context.
   - **Secrets**: Information implying hidden truths, true identities, or undiscovered locations (e.g. "Actually...", "Secretly...", "Hidden...") MUST be withheld until discovered.

2. **Dramatic Value (演出価値)**:
   - Before revealing significant info, ask: "Is this the most dramatic moment?"
   - Prioritize **Suspense and Teasing**. Hint at truths (e.g. "A familiar scratch on the armor") rather than stating them outright.
   - Maximize impact. Don't waste plot twists on casual description.

3. **Delivery Strategy (公開演出)**:
   - **Vehicle**: Use the right vehicle for the reveal.
     - *Character*: The most relevant character speaks it.
     - *Object/Environment*: Found letters, scars, ruins.
     - *Action*: Events revealing the truth (e.g. magic failing).
   - **Show, Don't Tell**: minimize narration. Let the player realize the truth through evidence.
`;
            }
            if (context?.chronicle) {
                narrativeSystemPrompt += `\n\n# Chronicle (History)\n${JSON.stringify(context.chronicle, null, 2)}`;
            }
            // Add World State for Narrative context
            if (context?.state) {
                narrativeSystemPrompt += `\n\n# Current World State (Reference)\n${JSON.stringify(context.state, null, 2)}`;
            }

            narrativeSystemPrompt += `\n\nROLE: Game Master.\nUSER ROLE: The user is playing as the character named "${playerName}".\nTASK: Write the next segment of the story based on the user's action.\nYou MUST maintain the "Secrets" and verify "Dramatic Value" before revealing Canon info.\nIMPORTANT: Focus ONLY on the story, description, and roleplay. Do NOT output JSON/State here. Just the text.`;

            const includeThoughts = config.includeThoughts ?? false;
            // Pass 1 Contents (Standard History)
            const narrativeContents = buildGeminiContentsFromTree(tree, historyLimit, includeThoughts, undefined); // State injected in system prompt now for clearer separation

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

            // Prepare Canon split for Extraction Prompt
            const canonGlobalRules = context?.canon?.globalRules || [];
            const canonEntriesOnly = context?.canon ? (() => {
                const { globalRules, ...rest } = context.canon;
                return rest;
            })() : {};

            let extractionSystemPrompt = `あなたは世界の状態管理システム（World State Manager）です。
あなたのタスクは、ゲームマスター（GM）の最新の物語とこれまでの会話履歴を分析し、世界の状態（World State）への変更点を **厳格なJSON形式** で抽出することです。

# World Rules (世界ルール・重要)
${canonGlobalRules.length > 0 ? canonGlobalRules.map(r => `- ${r}`).join('\n') : "(なし)"}

# Canon (世界設定・正典)
${JSON.stringify(canonEntriesOnly, null, 2)}

# Chronicle (歴史・履歴)
${context?.chronicle ? JSON.stringify(context.chronicle, null, 2) : "{}"}

# Current World State (更新前の状態)
${context?.state ? JSON.stringify(context.state, null, 2) : "{}"}

重要ルール (CRITICAL RULES):
1. **フォーマット**: 出力は必ず 'StatePatch' スキーマに適合した有効なJSONオブジェクトでなければなりません。
2. **SceneとPlayer**: 物語に基づき、現在の \`scene\`（時間、場所）と \`player\`（状態、場所）を必ず出力してください。
   - **プレイヤーの識別**: プレイヤーキャラクターの名前は「**${playerName}**」です。他のNPCと混同しないでください。
3. **Entities (エンティティ)**: 
   - 物語中で言及、または示唆されたエンティティを抽出してください。
   - **新規エンティティ**（Canonに存在していたとしても現在の状態に不在なら）: 新しいUUIDを使用し、'name', 'condition', 'activity', 'relationToPlayer', 'location' を定義してください。
   - **既存エンティティ**: 既存のIDを使用し、'condition', 'activity' 等の変化したフィールドのみを更新してください。
   - **削除 (Pruning)**: エンティティが死亡、破壊、あるいは永久に物語から退場した場合、必ず \`deleted: true\` を設定してください。
   - **再登場 (Re-appearance)**: 「現在の状態」にはいないが、「Canon」に存在するキャラクターが物語に登場した場合、必ず \`entities\` リストに新規エンティティのルールで追加（再インスタンス化）してください。
   - **言語**: 説明文や名称、Entity/Playerのconditionなどの自由記述は **日本語** です。ただし、Quest/ThreadのstatusやEventのtypeなど、スキーマで固定された **ENUM値** はスキーマ定義に従い **英語のまま** 出力してください（例: 'ACTIVE', 'COMPLETED'）。
4. **Quests vs Threads**:
   - **Quest (クエスト)**: 明確な手順とゴールを持つ構造化された目標（例：「ネズミ退治」「王女の護衛」）。プレイヤーが依頼を受諾した場合に使用します。
   - **Thread (スレッド)**: 漠然とした物語のフック、謎、未解決の気掛かり（例：「赤い服の男の正体」「奇妙な霧」）。まだ正式なクエストになっていない事象の追跡に使用します。
5. **差分なし**: 意味のある変化がない場合、空のパッチ、または必須のScene/Playerコンテキストのみを返してください。
6. **簡潔さの重視 (Redundancy Policy)**: 記述は簡潔に保ってください。**不必要な反復や、無意味な繰り返しの出力は厳禁です。** 一度述べた内容は繰り返さず、最新の状態のみを反映してください。
7. **UUID生成 (Technical)**: 新規IDが必要な場合、決してあなたの推論だけでランダムな文字列を作成してはいけません。必ず **Pythonコード実行 (Code Execution)** ツールを使用して、\`uuid.uuid4()\` で有効なUUIDを生成してください。

# 良い出力例 (GOOD OUTPUT EXAMPLE)
以下のような形式を目指してください（自由記述は日本語、ENUMは英語）：
\`\`\`json
{
  "scene": {
    "time": "真夜中",
    "location": { "name": "廃墟となった礼拝堂", "detail": "崩れた壁から月明かりが差し込んでいる" },
    "atmosphere": "静寂だが、不穏な空気"
  },
  "player": {
    "condition": "警戒中",
    "location": { "name": "礼拝堂の入り口" },
    "activity": "周囲を伺っている"
  },
  "entities": [
    {
      "id": "existing-uuid-123",
      "condition": "気絶",
      "activity": "床に倒れている",
      "relationToPlayer": "敵対的"
    },
    {
      "name": "謎の影",
      "condition": "潜伏",
      "activity": "天井からプレイヤーを見下ろしている",
      "relationToPlayer": "未知",
      "location": { "name": "天井の梁" }
    }
  ],
  "quests": [
    {
      "id": "quest-uuid",
      "label": "礼拝堂の調査",
      "status": "ACTIVE",
      "steps": [
        { "description": "内部を探索する", "completed": true },
        { "description": "地下への入り口を見つける", "completed": false }
      ]
    }
  ],
  "threads": [
    {
      "id": "thread-uuid",
      "description": "礼拝堂の床に残された奇妙な紋章の意味",
      "status": "UNRESOLVED"
    }
  ]
}
\`\`\`
`;

            // Prepare contents for extraction: History + User Input + [NEW NARRATIVE]
            // We can construct a synthetic history where the model "just spoke" the narrative.
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

            // ==========================================
            // PASS 2: STATE EXTRACTION (Logical/Strict)
            // ==========================================

            // Retry loop configuration
            const MAX_STATE_RETRIES = 1;
            let statePatch = {};

            for (let attempt = 1; attempt <= MAX_STATE_RETRIES; attempt++) {
                try {
                    console.log(`State Extraction Attempt ${attempt}/${MAX_STATE_RETRIES}`);

                    const extractionRes = await genai.models.generateContent({
                        model: "gemini-3-flash-preview",
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
                    console.log("thoughts:", extractionRes.candidates?.[0].content?.parts?.[0].text);
                    console.log("text:", extractionRes.candidates?.[0].content?.parts?.[1].text);
                    console.log("Extraction Raw JSON:", rawJSON);

                    const parsed = JSON.parse(rawJSON);

                    // Validate against Zod Schema to ensure structure is correct
                    const validation = StatePatchSchema.safeParse(parsed);

                    if (validation.success) {
                        statePatch = parsed;
                        break; // Success!
                    } else {
                        console.error(`State Validation Failed (Attempt ${attempt}):`, validation.error);
                        if (attempt === MAX_STATE_RETRIES) {
                            console.error("Max retries reached. Returning empty patch.");
                        }
                    }
                } catch (e) {
                    console.error(`State Extraction Failed (Attempt ${attempt}):`, e);
                    if (attempt === MAX_STATE_RETRIES) {
                        console.error("Max retries reached. Returning empty patch.");
                    }
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

            const curationSystemPrompt = `You are a "Canon Curator" system for a RPG world.
Your task is to analyze the current temporary "World State" (Entities, Facts, Hypotheses) and propose permenant additions or updates to the "Canon" (World Setting Encyclopedia).

# Input Data
1. **Canon (Existing Settings)**: Immmutable truths.
2. **Current State (Lore/Context)**: Recent events, temporary entities, and new facts discovered by the player.

# Task
Identify elements in the "Current State" that are significant enough to be recorded in the "Canon".
- **New Entries**: Named characters, locations, or items that appeared and seem important.
- **Updates**: New facts about existing Canon entries.

# Rules
- **Significance**: Do not propose trivial things (e.g. "a random rat"). Only propose named NPCs, key items, or important lore facts.
- **Merge**: If an entity in State matches a Canon entry name, propose an UPDATE to that Canon entry.
- **Create**: If a named entity/location is new and important, propose a CREATE.
- **Language**: All content must be in **Japanese**.
- **Preservation**: When updating an entry, you MUST PRESERVE existing details unless they are explicitly contradicted by the new state. Do not delete historical logs or unrelated details. Append new info, do not replace.

# Output Schema
Return a JSON object with a list of "proposals".
`;

            const CanonProposalSchema = z.object({
                proposals: z.array(z.object({
                    type: z.enum(['CREATE', 'UPDATE']),
                    targetCanonId: CanonIdSchema.optional().describe("If UPDATE, provide the existing Canon ID."),
                    entry: WorldEntrySchema.omit({ id: true }).describe("The content of the entry. For UPDATE, this represents the *merged* final state of the entry."),
                    reason: z.string().describe("Why is this being proposed? e.g. 'Player met new NPC', 'Revealed true identity'."),
                }))
            });

            // Construct prompt content
            const promptContent = `
# Canon
${JSON.stringify(context.canon, null, 2)}

# Current State (Lore to Analyze)
${JSON.stringify(context.state, null, 2)}

Based on the above, generate a list of Canon Proposals (Create or Update).
`;

            const res = await genai.models.generateContent({
                model: "gemini-3-flash-preview",
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