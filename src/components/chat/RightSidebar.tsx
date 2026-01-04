import { useChatStore } from '@/stores/chatStore';
import { clsx } from 'clsx';
import { Book, Database, X } from 'lucide-react';
import { CanonPanel } from './CanonPanel';
import { WorldInfoPanel } from './WorldInfoPanel';

export const RightSidebar = () => {
    const { rightSidebarMode, setRightSidebarMode, setWorldInfoOpen } = useChatStore();

    return (
        <div className="flex flex-col h-full w-full bg-black/50 backdrop-blur-md border-l border-white/10">
            {/* Mode Switcher Tabs */}
            <div className="flex items-center border-b border-white/10 bg-black/20">
                <button
                    onClick={() => setRightSidebarMode('state')}
                    className={clsx(
                        "flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors",
                        rightSidebarMode === 'state'
                            ? "text-purple-400 bg-white/5 border-b-2 border-purple-500"
                            : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                >
                    <Book size={14} />
                    <span>State (Lore)</span>
                </button>
                <button
                    onClick={() => setRightSidebarMode('canon')}
                    className={clsx(
                        "flex-1 flex items-center justify-center gap-2 py-3 text-xs font-bold uppercase tracking-wider transition-colors",
                        rightSidebarMode === 'canon'
                            ? "text-amber-400 bg-white/5 border-b-2 border-amber-500"
                            : "text-gray-500 hover:text-gray-300 hover:bg-white/5"
                    )}
                >
                    <Database size={14} />
                    <span>Canon</span>
                </button>

                {/* Mobile Close Button */}
                <button
                    onClick={() => setWorldInfoOpen(false)}
                    className="p-3 text-gray-400 hover:text-white md:hidden border-l border-white/5"
                >
                    <X size={16} />
                </button>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-hidden relative">
                {rightSidebarMode === 'state' ? (
                    <WorldInfoPanel />
                ) : (
                    <CanonPanel />
                )}
            </div>
        </div>
    );
};
