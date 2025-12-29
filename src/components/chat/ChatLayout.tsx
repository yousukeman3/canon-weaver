import { useChatStore } from '@/stores/chatStore';
import { clsx } from 'clsx';
import { Menu } from 'lucide-react';
import React from 'react';
import { Sidebar } from './Sidebar';

export const ChatLayout = ({ children }: { children: React.ReactNode }) => {
    const { sidebarOpen, setSidebarOpen, loadSessions } = useChatStore();

    React.useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    return (
        <div className="relative flex h-full w-full overflow-hidden bg-[url('/bg-placeholder.jpg')] bg-cover bg-center">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Sidebar */}
            <div
                className={clsx(
                    "z-20 h-full bg-black/50 border-r border-white/10 transition-[width,opacity] duration-300 ease-in-out backdrop-blur-md",
                    sidebarOpen ? "w-[320px] opacity-100" : "w-0 opacity-0 overflow-hidden"
                )}
            >
                <Sidebar />
            </div>

            {/* Main Content */}
            <div className="relative z-10 flex flex-1 flex-col h-full overflow-hidden">
                {/* Header / Toggle */}
                <header className="flex h-12 items-center px-4 border-b border-white/5 bg-transparent">
                    {!sidebarOpen && (
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className="p-2 rounded-md hover:bg-white/10 text-white/70 transition-colors"
                        >
                            <Menu size={20} />
                        </button>
                    )}
                </header>

                {/* Chat Area */}
                <main className="flex-1 overflow-hidden relative">
                    {children}
                </main>
            </div>
        </div>
    );
};
