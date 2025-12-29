import { ChatTree, getPathNodesFromHead } from "@/lib/llm/chatTree";
import { GoogleGenAI } from "@google/genai";
import { NextRequest, NextResponse } from "next/server";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";
// Using a fast model for title generation
const TITLE_MODEL = "gemini-2.0-flash-exp";

export async function POST(req: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not set" },
            { status: 500 }
        );
    }

    try {
        const body = await req.json();
        const { tree } = body as { tree: ChatTree };

        if (!tree) {
            return NextResponse.json({ error: "Missing tree" }, { status: 400 });
        }

        // Extract text from the first few turns (e.g. first 2-4 messages)
        // We don't need the whole history, just enough to get context.
        const nodes = getPathNodesFromHead(tree, { limit: 6 });
        const conversationText = nodes
            .filter(n => n.role !== 'system')
            .map(n => {
                const text = n.parts.find(p => p.kind === 'text')?.text || "";
                return `${n.role}: ${text}`;
            })
            .join("\n");

        const prompt = `
Summarize the following conversation into a short, concise title (max 6 words).
The title MUST be in Japanese language.
Do not use quotes. output the title directly.

Conversation:
${conversationText}
`;

        const genai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
        const res = await genai.models.generateContent({
            model: TITLE_MODEL,
            contents: [{
                role: "user",
                parts: [{ text: prompt }]
            }],
            config: {
                temperature: 0.7,
                maxOutputTokens: 20
            }
        });

        const title = res.text?.trim() || "New Chat";

        return NextResponse.json({ title });
    } catch (error: any) {
        console.error("Title Generation Error:", error);
        return NextResponse.json(
            { error: error.message || "Failed to generate title" },
            { status: 500 }
        );
    }
}
