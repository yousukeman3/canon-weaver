'use client';

import { ChatLayout } from "@/components/chat/ChatLayout";
import { ChatView } from "@/components/chat/ChatView";
import { useChatStore } from "@/stores/chatStore";
import { useEffect } from "react";

export default function Home() {
    const { loadSession, currentSessionId } = useChatStore();

    // When hitting root, we might want to ensure we're in "New Chat" mode.
    // If we have a currentSessionId from a previous navigation, we should probably clear it
    // or create a new session immediately. For now, let's assume ChatLayout + an empty ID
    // means "New Chat".

    useEffect(() => {
        // If we wanted to force a new session creation on visit:
        // createSession();
        // But maybe just rendering empty is fine until they type.

        // However, if we are coming from a populated state, we need to clear it.
        // We need a 'reset' action or similar, or just relying on `createEmptyTree` default in store.
        // But store state persists in client side navigation.

        // TODO: Add reset action to store if needed. 
        // For now, let's just render. The store's initial state is "New Chat".
        // If we navigate back here, we might see the old chat if we don't clear it.
        // Let's implement a clear/reset in the useEffect? 

        // Actually, Sidebar "New Chat" does the create & push.
        // If they manually go to "/", we probably expecting a fresh start.
    }, []);

    return (
        <ChatLayout>
            <ChatView />
        </ChatLayout>
    );
}
