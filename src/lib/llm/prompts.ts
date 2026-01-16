import { Canon, Chronicle, WorldState } from "@/lib/domain/schema";

export const buildNarrativeSystemPrompt = (
    baseSystemPrompt: string,
    context: { canon?: Canon; chronicle?: Chronicle; state?: WorldState; }
): string => {
    let prompt = baseSystemPrompt;
    const playerName = context.state?.player?.name || "Player";

    // 1. Canon Rules
    if (context.canon) {
        const { globalRules, ...restCanon } = context.canon;
        if (globalRules && globalRules.length > 0) {
            prompt += `\n\n# World Rules (Important)\n${globalRules.map(r => `- ${r}`).join('\n')}`;
        }

        // GM Truths
        prompt += `
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

    // 2. Chronicle
    if (context.chronicle) {
        prompt += `\n\n# Chronicle (History)\n${JSON.stringify(context.chronicle, null, 2)}`;
    }

    // 3. Current State
    if (context.state) {
        prompt += `\n\n# Current World State (Reference)\n${JSON.stringify(context.state, null, 2)}`;
    }

    // 4. Role Definition
    prompt += `\n\nROLE: Game Master.\nUSER ROLE: The user is playing as the character named "${playerName}".\nTASK: Write the next segment of the story based on the user's action.\nYou MUST maintain the "Secrets" and verify "Dramatic Value" before revealing Canon info.\nIMPORTANT: Focus ONLY on the story, description, and roleplay. Do NOT output JSON/State here. Just the text.`;

    return prompt;
};

export const buildExtractionSystemPrompt = (
    context: { canon?: Canon; chronicle?: Chronicle; state?: WorldState; }
): string => {
    const canonGlobalRules = context.canon?.globalRules || [];
    const canonEntriesOnly = context.canon ? (() => {
        const { globalRules, ...rest } = context.canon;
        return rest;
    })() : {};
    const playerName = context.state?.player?.name || "Player";

    return `あなたは世界の状態管理システム（World State Manager）です。
あなたのタスクは、ゲームマスター（GM）の最新の物語とこれまでの会話履歴を分析し、世界の状態（World State）への変更点を **厳格なJSON形式** で抽出することです。

# World Rules (世界ルール・重要)
${canonGlobalRules.length > 0 ? canonGlobalRules.map(r => `- ${r}`).join('\n') : "(なし)"}

# Canon (世界設定・正典)
${JSON.stringify(canonEntriesOnly, null, 2)}

# Chronicle (歴史・履歴)
${context.chronicle ? JSON.stringify(context.chronicle, null, 2) : "{}"}

# Current World State (更新前の状態)
${context.state ? JSON.stringify(context.state, null, 2) : "{}"}

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
};

export const buildCurationSystemPrompt = (): string => {
    return `You are a "Canon Curator" system for a RPG world.
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
};

export const buildCurationUserContext = (
    context: { canon?: Canon; chronicle?: Chronicle; state?: WorldState; }
): string => {
    return `
# Canon
${JSON.stringify(context.canon, null, 2)}

# Current State (Lore to Analyze)
${JSON.stringify(context.state, null, 2)}

Based on the above, generate a list of Canon Proposals (Create or Update).
`;
};
