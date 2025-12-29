import { ChatSession } from '@/lib/persistence';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'sessions');

async function ensureDataDir() {
    try {
        await fs.access(DATA_DIR);
    } catch {
        await fs.mkdir(DATA_DIR, { recursive: true });
    }
}

// GET /api/sessions - List all sessions (metadata only)
export async function GET() {
    await ensureDataDir();
    try {
        const files = await fs.readdir(DATA_DIR);
        const sessions = await Promise.all(
            files
                .filter(f => f.endsWith('.json'))
                .map(async (file) => {
                    const content = await fs.readFile(path.join(DATA_DIR, file), 'utf-8');
                    const session = JSON.parse(content) as ChatSession;
                    return {
                        id: session.id,
                        title: session.title,
                        createdAt: session.createdAt,
                        updatedAt: session.updatedAt
                    };
                })
        );

        // Sort by updatedAt desc
        sessions.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

        return NextResponse.json(sessions);
    } catch (error) {
        console.error("List sessions error:", error);
        return NextResponse.json({ error: 'Failed to list sessions' }, { status: 500 });
    }
}

// POST /api/sessions - Create new session
export async function POST(req: NextRequest) {
    await ensureDataDir();
    try {
        const body = await req.json();
        const session = body as ChatSession;

        if (!session.id) {
            return NextResponse.json({ error: 'Session ID required' }, { status: 400 });
        }

        const filePath = path.join(DATA_DIR, `${session.id}.json`);
        await fs.writeFile(filePath, JSON.stringify(session, null, 2));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Create session error:", error);
        return NextResponse.json({ error: 'Failed to create session' }, { status: 500 });
    }
}
