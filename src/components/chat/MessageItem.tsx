import { ChatNode, getAlternatives } from '@/lib/llm/chatTree';
import { useChatStore } from '@/stores/chatStore';
import { clsx } from 'clsx';
import { AnimatePresence, motion } from 'framer-motion';
import { Bot, Brain, Check, ChevronLeft, ChevronRight, Pencil, RefreshCw, User, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MessageItemProps {
    node: ChatNode;
}

export const MessageItem = ({ node }: MessageItemProps) => {
    const { tree, navigateBranch, regenerate, editMessage } = useChatStore();
    const [showThoughts, setShowThoughts] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState('');
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const isUser = node.role === 'user';
    const isSystem = node.role === 'system';

    // Get siblings for navigation
    const siblings = node.parentId ? getAlternatives(tree, node.parentId) : [node];
    const siblingIndex = siblings.findIndex(n => n.id === node.id);
    const siblingCount = siblings.length;

    if (isSystem) return null; // Or render differently? implementation plan said "hide system" or implied user/assist focus.

    const textPart = node.parts.find(p => p.kind === 'text');
    const thoughtParts = node.parts.filter(p => p.kind === 'thought');
    const content = textPart?.kind === 'text' ? textPart.text : '';

    useEffect(() => {
        if (isEditing && textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
            textareaRef.current.focus();
        }
    }, [isEditing]);

    const handleEditStart = () => {
        setEditText(content);
        setIsEditing(true);
    };

    const handleEditSave = async () => {
        if (editText.trim() !== content) {
            await editMessage(node.id, editText);
        }
        setIsEditing(false);
    };

    const handleEditCancel = () => {
        setIsEditing(false);
        setEditText('');
    };

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className={clsx(
                "group w-full flex mb-6",
                isUser ? "justify-end" : "justify-start"
            )}
        >
            <div className={clsx(
                "flex max-w-[85%] md:max-w-[75%] gap-3",
                isUser ? "flex-row-reverse" : "flex-row"
            )}>
                {/* Avatar */}
                <div className={clsx(
                    "shrink-0 w-8 h-8 rounded-full flex items-center justify-center mt-1",
                    isUser ? "bg-purple-600" : "bg-emerald-600"
                )}>
                    {isUser ? <User size={16} className="text-white" /> : <Bot size={16} className="text-white" />}
                </div>

                {/* Bubble */}
                <div className="flex flex-col min-w-0">
                    {/* Name & Nav */}
                    <div className={clsx(
                        "flex items-center gap-2 mb-1 px-1",
                        isUser ? "justify-end" : "justify-start"
                    )}>
                        <span className="text-xs font-medium text-gray-400">
                            {isUser ? 'You' : 'Assistant'}
                        </span>

                        {siblingCount > 1 && (
                            <div className="flex items-center gap-1 bg-white/5 rounded-full px-1.5 py-0.5 ml-2">
                                <button
                                    onClick={() => navigateBranch(node.id, 'prev')}
                                    className="p-0.5 hover:text-white text-gray-500 transition-colors"
                                >
                                    <ChevronLeft size={12} />
                                </button>
                                <span className="text-[10px] text-gray-400 min-w-[20px] text-center">
                                    {siblingIndex + 1}/{siblingCount}
                                </span>
                                <button
                                    onClick={() => navigateBranch(node.id, 'next')}
                                    className="p-0.5 hover:text-white text-gray-500 transition-colors"
                                >
                                    <ChevronRight size={12} />
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Message Content */}
                    <div className={clsx(
                        "relative px-5 py-3 rounded-2xl text-sm leading-relaxed shadow-sm",
                        isUser
                            ? "bg-[#27272a] text-gray-100 rounded-tr-sm"
                            : "bg-[#18181b] text-gray-200 border border-white/5 rounded-tl-sm glass"
                    )}>
                        {/* Thoughts */}
                        {thoughtParts.length > 0 && (
                            <div className="mb-2 border-b border-white/5 pb-2">
                                <button
                                    onClick={() => setShowThoughts(!showThoughts)}
                                    className="flex items-center gap-1.5 text-xs text-purple-400/80 hover:text-purple-400 transition-colors w-full text-left"
                                >
                                    <Brain size={12} />
                                    <span className="italic">Thought Process {showThoughts ? '(Hide)' : '(Show)'}</span>
                                </button>
                                <AnimatePresence>
                                    {showThoughts && (
                                        <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden"
                                        >
                                            <div className="pt-2 text-xs text-gray-500 italic font-mono bg-black/20 p-2 rounded mt-1">
                                                {thoughtParts.map((t, i) => (
                                                    <div key={i}>{t.kind === 'thought' ? t.thought : ''}</div>
                                                ))}
                                            </div>
                                        </motion.div>
                                    )}
                                </AnimatePresence>
                            </div>
                        )}

                        {/* Markdown Text or Edit Input */}
                        {isEditing ? (
                            <div className="w-full min-w-[240px] md:min-w-[400px]">
                                <textarea
                                    ref={textareaRef}
                                    value={editText}
                                    onChange={(e) => {
                                        setEditText(e.target.value);
                                        e.target.style.height = 'auto';
                                        e.target.style.height = e.target.scrollHeight + 'px';
                                    }}
                                    className="w-full bg-black/20 text-gray-100 p-2 rounded resize-none focus:outline-none focus:ring-1 focus:ring-purple-500/50 text-sm leading-relaxed"
                                    rows={1}
                                />
                                <div className="flex items-center justify-end gap-2 mt-2">
                                    <button
                                        onClick={handleEditCancel}
                                        className="p-1 hover:bg-white/10 rounded text-gray-400 hover:text-white transition-colors"
                                        title="Cancel"
                                    >
                                        <X size={14} />
                                    </button>
                                    <button
                                        onClick={handleEditSave}
                                        className="p-1 bg-purple-600/20 hover:bg-purple-600/40 text-purple-300 hover:text-purple-100 rounded transition-colors"
                                        title="Save"
                                    >
                                        <Check size={14} />
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div className="prose prose-invert prose-sm max-w-none wrap-break-words">
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {content}
                                </ReactMarkdown>
                            </div>
                        )}
                    </div>

                    {/* Footer Action */}
                    {!isEditing && (
                        <div className="flex items-center gap-2 mt-1 px-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!isUser && (
                                <button
                                    onClick={() => regenerate(node.id)}
                                    className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                                    title="Regenerate"
                                >
                                    <RefreshCw size={14} />
                                </button>
                            )}
                            <button
                                onClick={handleEditStart}
                                className="p-1 hover:bg-white/10 rounded text-gray-500 hover:text-white transition-colors"
                                title="Edit"
                            >
                                <Pencil size={14} />
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </motion.div>
    );
};
