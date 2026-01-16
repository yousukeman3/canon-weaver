import { useChatStore } from '@/stores/chatStore';
import { clsx } from 'clsx';
import { Send, Sparkles } from 'lucide-react';
import { useRef, useState } from 'react';

export const Composer = () => {
    const sendMessage = useChatStore(s => s.sendMessage);
    const isGenerating = useChatStore(s => s.isGenerating);
    const [input, setInput] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const handleSubmit = async () => {
        if (!input.trim() || isGenerating) return;
        const text = input;
        setInput('');

        // Reset height
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
        }

        await sendMessage(text);
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
        }
    };

    return (
        <div className="w-full max-w-4xl mx-auto p-4 z-20">
            <div className="relative flex items-end gap-2 bg-[#18181b]/90 backdrop-blur-md rounded-2xl border border-white/10 p-2 shadow-xl ring-1 ring-white/5">
                <textarea
                    ref={textareaRef}
                    value={input}
                    onChange={handleInput}
                    onKeyDown={handleKeyDown}
                    placeholder="Send a message..."
                    className="flex-1 max-h-[200px] min-h-[44px] w-full resize-none bg-transparent px-4 py-3 text-sm text-gray-200 placeholder:text-gray-500 focus:outline-none scrollbar-thin"
                    rows={1}
                />

                <button
                    onClick={handleSubmit}
                    disabled={!input.trim() || isGenerating}
                    className={clsx(
                        "flex items-center justify-center p-3 rounded-xl transition-all duration-200",
                        input.trim() && !isGenerating
                            ? "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-500/20"
                            : "bg-white/5 text-gray-500 cursor-not-allowed hover:bg-white/10"
                    )}
                >
                    {isGenerating ? (
                        <Sparkles className="animate-spin" size={18} />
                    ) : (
                        <Send size={18} />
                    )}
                </button>
            </div>
        </div>
    );
};
