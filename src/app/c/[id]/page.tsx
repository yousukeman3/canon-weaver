'use client';

import { ChatLayout } from '@/components/chat/ChatLayout';
import { ChatView } from '@/components/chat/ChatView';
import { useChatStore } from '@/stores/chatStore';
import { use, useEffect } from 'react';

type Props = {
    params: Promise<{ id: string }>;
};

export default function ChatPage(props: Props) {
    const params = use(props.params);
    const { loadSession, currentSessionId } = useChatStore();

    useEffect(() => {
        if (params.id) {
            loadSession(params.id);
        }
    }, [params.id, loadSession]);

    // Optional: show loading state while session ID doesn't match?
    // But ChatLayout handles empty/initial state well enough.

    return (
        <ChatLayout>
            <ChatView />
        </ChatLayout>
    );
}
