import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const RequestSchema = z.object({
    events: z.array(z.object({
        id: z.string(),
        timestamp: z.string(),
        summary: z.string(),
        type: z.string(),
    })),
    context: z.any().optional(), // Canon etc if needed
});

const ChapterSummarySchema = z.object({
    title: z.string(),
    summary: z.string(),
});

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { events, context } = RequestSchema.parse(body);

        if (events.length === 0) {
            return NextResponse.json({ error: "No events to summarize" }, { status: 400 });
        }

        const genai = new GoogleGenAI({ apiKey: process.env.GOOGLE_GEMINI_API_KEY! });

        const prompt = `
あなたはクロニクル・キーパー（年代記の記録者）です。
以下の時系列イベントリストを、物語の1つの「章（Chapter）」として要約してください。
要約は簡潔にしつつ、主要な物語の展開、重要な決断、そしてその結果を捉えてください。
出力は必ず**日本語**で行ってください。

# 入力イベント (Events)
${events.map(e => `[${e.type}] ${e.summary}`).join('\n')}

# 出力フォーマット (JSON)
{
  "title": "この章を表す、短く印象的なタイトル",
  "summary": "イベントの2〜3文の要約。"
}
        `;

        const result = await genai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [{ role: 'user', parts: [{ text: prompt }] }],
            config: {
                responseMimeType: "application/json",
                temperature: 0.5,
                responseSchema: ChapterSummarySchema.toJSONSchema({ target: "openapi-3.0" }),
                thinkingConfig: {
                    thinkingLevel: ThinkingLevel.MEDIUM
                }
            }
        });

        const text = result.text || "{}";
        const data = JSON.parse(text);

        return NextResponse.json(data);

    } catch (error) {
        console.error("Chapter summarization failed:", error);
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
