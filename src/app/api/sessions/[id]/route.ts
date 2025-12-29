import { ChatSession } from '@/lib/persistence';
import fs from 'fs/promises';
import { NextRequest, NextResponse } from 'next/server';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data', 'sessions');

async function getFilePath(id: string) {
    // Basic sanitization
    const safeId = path.basename(id);
    return path.join(DATA_DIR, `${safeId}.json`);
}

type Props = {
    params: Promise<{
        id: string;
    }>;
}

// GET /api/sessions/[id] - Load session
export async function GET(
    req: NextRequest,
    props: Props
) {
    const params = await props.params;
    try {
        const filePath = await getFilePath(params.id);
        const content = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(content);
        return NextResponse.json(session);
    } catch (error) {
        return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    }
}

// PUT /api/sessions/[id] - Save/Update session
export async function PUT(
    req: NextRequest,
    props: Props
) {
    const params = await props.params;
    try {
        const body = await req.json();
        const session = body as ChatSession;

        // Ensure ID matches
        if (session.id !== params.id) {
            return NextResponse.json({ error: 'ID mismatch' }, { status: 400 });
        }

        const filePath = await getFilePath(params.id);
        await fs.writeFile(filePath, JSON.stringify(session, null, 2));

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Save session error:", error);
        return NextResponse.json({ error: 'Failed to save session' }, { status: 500 });
    }
}

// PATCH /api/sessions/[id] - Rename session (or partial update)
export async function PATCH(
    req: NextRequest,
    props: Props
) {
    const params = await props.params;
    try {
        const body = await req.json();
        const { title } = body;

        if (!title) {
            return NextResponse.json({ error: 'Title is required' }, { status: 400 });
        }

        const filePath = await getFilePath(params.id);

        // Read existing session to avoid data loss
        // In a real DB we'd just UPDATE one field. With files we must read-modify-write.
        const content = await fs.readFile(filePath, 'utf-8');
        const session = JSON.parse(content) as ChatSession;

        session.title = title;
        session.updatedAt = new Date().toISOString();

        await fs.writeFile(filePath, JSON.stringify(session, null, 2));

        return NextResponse.json({ success: true, session });
    } catch (error) {
        console.error("Rename session error:", error);
        return NextResponse.json({ error: 'Failed to update session' }, { status: 500 });
    }
}

// DELETE /api/sessions/[id] - Delete session
export async function DELETE(
    req: NextRequest,
    props: Props
) {
    const params = await props.params;
    try {
        const filePath = await getFilePath(params.id);
        await fs.unlink(filePath);
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
    }
}
