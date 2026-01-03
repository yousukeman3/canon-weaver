import { ChatTree } from "@/lib/llm/chatTree";
import { createGeminiClient, GeminiConfig } from "@/lib/llm/gemini";
import { NextRequest, NextResponse } from "next/server";

// In a real app, do not hardcode, use env vars. 
// For this environment, we rely on process.env.GEMINI_API_KEY
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || "";

export async function POST(req: NextRequest) {
    if (!GEMINI_API_KEY) {
        return NextResponse.json(
            { error: "GEMINI_API_KEY is not set" },
            { status: 500 }
        );
    }

    try {
        const body = await req.json();
        const { tree, config, historyLimit, context } = body as {
            tree: ChatTree;
            config: GeminiConfig;
            historyLimit?: number;
            context?: any; // Allow passing context: { canon, chronicle, state }
        };

        if (!tree) {
            return NextResponse.json({ error: "Missing tree" }, { status: 400 });
        }

        const client = createGeminiClient(GEMINI_API_KEY);

        // Default config if not provided
        const finalConfig: GeminiConfig = config || {
            model: "gemini-3-flash-preview", // default model
            temperature: 0.7,
            presencePenalty: 0.0,
            frequencyPenalty: 0.0,
        };

        const result = await client.generateFromTree({
            tree,
            config: finalConfig,
            historyLimit: historyLimit ?? 20,
            context,
        });

        return NextResponse.json(result);
    } catch (error: any) {
        console.error("Gemini API Error Detail:", {
            message: error.message,
            stack: error.stack,
            code: error.code, // if available
            status: error.status, // if available
            details: error.details, // if available
        });
        return NextResponse.json(
            { error: error.message || "Internal Server Error", details: error },
            { status: 500 }
        );
    }
}
