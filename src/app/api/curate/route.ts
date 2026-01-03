import { createGeminiClient } from '@/lib/llm/gemini';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
    try {
        const { context } = await req.json();

        if (!context || !context.state) {
            return NextResponse.json({ error: "Context with state is required" }, { status: 400 });
        }

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: "Server Misconfigured: Missing API Key" }, { status: 500 });
        }

        const client = createGeminiClient(apiKey);

        // We use a fixed config for curation for now, or could pass it from client if needed
        // But for safety/consistency, let's keep the config server-side or minimal
        const proposals = await client.curateCanon({
            context
        });

        return NextResponse.json({ proposals });

    } catch (error) {
        console.error("Curation API Error:", error);
        return NextResponse.json({ error: "Failed to curate canon" }, { status: 500 });
    }
}
