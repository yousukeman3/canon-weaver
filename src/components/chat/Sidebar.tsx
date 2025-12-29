import { useChatStore } from '@/stores/chatStore';
import { clsx } from 'clsx';
import { Check, Loader2, MessageSquare, Pencil, Plus, Trash2, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';

export const Sidebar = () => {
    const router = useRouter();
    const {
        setSidebarOpen,
        config,
        updateConfig,
        sessions,
        currentSessionId,
        createSession,
        renameSession,
        deleteSession,
        isSessionLoading
    } = useChatStore();

    const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
    const [editValue, setEditValue] = useState("");

    const startEditing = (e: React.MouseEvent, session: { id: string, title: string }) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingSessionId(session.id);
        setEditValue(session.title);
    };

    const saveEditing = async (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (editValue.trim()) {
            await renameSession(sessionId, editValue);
        }
        setEditingSessionId(null);
    };

    const cancelEditing = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setEditingSessionId(null);
    };

    const handleDelete = async (e: React.MouseEvent, sessionId: string) => {
        e.preventDefault();
        e.stopPropagation();
        if (confirm("Are you sure you want to delete this chat?")) {
            await deleteSession(sessionId);
            if (currentSessionId === sessionId) {
                router.push('/');
            }
        }
    };

    const handleNewChat = async () => {
        const id = await createSession();
        if (id) {
            router.push(`/c/${id}`);
            // On mobile close sidebar
            if (window.innerWidth < 768) {
                setSidebarOpen(false);
            }
        }
    };

    return (
        <div className="flex h-full flex-col p-4 text-sm text-gray-200">
            <div className="flex items-center justify-between mb-6">
                <h2 className="font-semibold text-white tracking-wide">Settings</h2>
                <button
                    onClick={() => setSidebarOpen(false)}
                    className="p-1 rounded-md hover:bg-white/10 transition-colors"
                >
                    <X size={18} />
                </button>
            </div>

            <div className="space-y-6 overflow-y-auto flex-1 pr-2 scrollbar-thin">
                {/* Session Management */}
                <section className="space-y-3">
                    <button
                        onClick={handleNewChat}
                        className="w-full flex items-center justify-center gap-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-200 py-2 rounded-lg transition-colors text-sm font-medium border border-purple-500/20"
                    >
                        <Plus size={16} />
                        New Chat
                    </button>

                    <div className="space-y-1 mt-4">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2 px-1">History</h3>
                        {sessions.length === 0 && (
                            <div className="text-xs text-gray-600 px-2 italic">No history yet</div>
                        )}
                        <div className="space-y-0.5">
                            {sessions.map((session) => (
                                <Link
                                    key={session.id}
                                    href={`/c/${session.id}`}
                                    className={clsx(
                                        "w-full text-left px-3 py-2 rounded text-xs transition-colors flex items-center gap-2 group relative",
                                        currentSessionId === session.id
                                            ? "bg-white/10 text-white"
                                            : "text-gray-400 hover:bg-white/5 hover:text-gray-200"
                                    )}
                                >
                                    <MessageSquare size={12} className="shrink-0" />

                                    {editingSessionId === session.id ? (
                                        <div className="flex-1 flex items-center gap-1 min-w-0">
                                            <input
                                                type="text"
                                                value={editValue}
                                                onChange={(e) => setEditValue(e.target.value)}
                                                onClick={(e) => e.preventDefault()}
                                                className="w-full bg-black/60 border border-purple-500/50 rounded px-1 py-0.5 text-xs text-white focus:outline-none"
                                                autoFocus
                                            />
                                            <button
                                                onClick={(e) => saveEditing(e, session.id)}
                                                className="p-1 hover:bg-green-500/20 text-green-400 rounded"
                                            >
                                                <Check size={12} />
                                            </button>
                                            <button
                                                onClick={cancelEditing}
                                                className="p-1 hover:bg-red-500/20 text-red-400 rounded"
                                            >
                                                <X size={12} />
                                            </button>
                                        </div>
                                    ) : (
                                        <>
                                            <span className="truncate flex-1">{session.title}</span>

                                            {/* Action Buttons (Visible on Hover) */}
                                            <div className={clsx(
                                                "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity",
                                                currentSessionId === session.id ? "opacity-100" : "" // Always show for active? Maybe not to keep clean.
                                            )}>
                                                <button
                                                    onClick={(e) => startEditing(e, session)}
                                                    className="p-1 hover:bg-white/20 rounded text-gray-400 hover:text-white"
                                                    title="Rename"
                                                >
                                                    <Pencil size={11} />
                                                </button>
                                                <button
                                                    onClick={(e) => handleDelete(e, session.id)}
                                                    className="p-1 hover:bg-red-500/20 rounded text-gray-400 hover:text-red-400"
                                                    title="Delete"
                                                >
                                                    <Trash2 size={11} />
                                                </button>
                                            </div>
                                        </>
                                    )}

                                    {isSessionLoading && currentSessionId === session.id && (
                                        <Loader2 size={12} className="animate-spin text-purple-400" />
                                    )}
                                </Link>
                            ))}
                        </div>
                    </div>
                </section>

                <div className="h-px bg-white/10 my-4" />

                <section className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Model</h3>
                    <div className="space-y-2">
                        <label className="block text-xs text-gray-400">Model Name</label>
                        <input
                            type="text"
                            value={config.model}
                            onChange={(e) => updateConfig({ model: e.target.value })}
                            className="w-full bg-black/40 border border-white/10 rounded px-3 py-2 text-white focus:outline-none focus:border-purple-500/50"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-xs text-gray-400">Temperature: {config.temperature}</label>
                        <input
                            type="range"
                            min="0" max="2" step="0.1"
                            value={config.temperature ?? 1}
                            onChange={(e) => updateConfig({ temperature: parseFloat(e.target.value) })}
                            className="w-full accent-purple-500 h-1 bg-white/10 rounded-lg appearance-none cursor-pointer"
                        />
                    </div>
                </section>

                <section className="space-y-3">
                    <h3 className="text-xs font-bold text-gray-400 uppercase tracking-wider">Parameters</h3>
                    <div className="flex items-center space-x-2">
                        <input
                            type="checkbox"
                            id="includeThoughts"
                            checked={config.includeThoughts}
                            onChange={(e) => updateConfig({ includeThoughts: e.target.checked })}
                            className="rounded border-white/20 bg-black/40 text-purple-500 focus:ring-purple-500/20"
                        />
                        <label htmlFor="includeThoughts" className="text-sm cursor-pointer select-none">Show Thinking</label>
                    </div>
                </section>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 text-center text-xs text-gray-500">
                Canon Weaver v0.1.0
            </div>
        </div>
    );
};
