import { getActivePathNodes } from '@/lib/llm/chatTree';
import { useChatStore } from '@/stores/chatStore';
import { useEffect, useRef } from 'react';
import { MessageItem } from './MessageItem';

export const MessageList = () => {
    const { tree, isGenerating } = useChatStore();
    const bottomRef = useRef<HTMLDivElement>(null);

    // Get active path
    const nodes = getActivePathNodes(tree).filter(n => n.role !== 'system');

    // Auto-scroll on new messages
    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [nodes.length, isGenerating, tree.headId]);

    return (
        <div className="w-full max-w-4xl mx-auto px-4 py-8">
            <div className="flex flex-col min-h-0">
                {nodes.length === 0 && (
                    <div className="flex flex-col items-center justify-center h-[50vh] text-gray-500 text-sm">
                        <p>No messages yet. Start the conversation!</p>
                    </div>
                )}

                {nodes.map((node) => (
                    <MessageItem key={node.id} node={node} />
                ))}

                {isGenerating && (
                    <div className="flex items-center gap-2 text-gray-500 text-sm ml-12 animate-pulse">
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                        <div className="w-2 h-2 bg-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                    </div>
                )}

                <div ref={bottomRef} className="h-4" />
            </div>
        </div>
    );
};
