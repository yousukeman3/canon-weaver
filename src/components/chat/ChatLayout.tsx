import { useChatStore } from '@/stores/chatStore';
import { clsx } from 'clsx';
import { Menu } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import React from 'react';
import { RightSidebar } from './RightSidebar';
import { Sidebar } from './Sidebar';


export const ChatLayout = ({ children }: { children: React.ReactNode }) => {
    const { sidebarOpen, setSidebarOpen, worldInfoOpen, setWorldInfoOpen, loadSessions, currentSessionId } = useChatStore();
    const router = useRouter();
    const pathname = usePathname();

    React.useEffect(() => {
        loadSessions();
    }, [loadSessions]);

    // Redirect to new session ID if we are on root/new and ID changes (e.g. from Auto-Save)
    React.useEffect(() => {
        if (currentSessionId && (pathname === '/' || pathname === '/new')) {
            router.push(`/c/${currentSessionId}`);
        }
    }, [currentSessionId, pathname, router]);

    return (
        <div className="relative flex h-full w-full overflow-hidden bg-[url('/bg-placeholder.jpg')] bg-cover bg-center">
            {/* Overlay */}
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />

            {/* Left Sidebar (Session List) */}
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
                <header className="flex h-12 items-center justify-between px-4 border-b border-white/5 bg-transparent">
                    <div className="flex items-center">
                        {!sidebarOpen && (
                            <button
                                onClick={() => setSidebarOpen(true)}
                                className="p-2 rounded-md hover:bg-white/10 text-white/70 transition-colors"
                            >
                                <Menu size={20} />
                            </button>
                        )}
                    </div>

                    {/* World Info Toggle Removed as per request (Permanent Sidebar) */}
                </header>

                {/* Chat Area */}
                <main className="flex-1 overflow-hidden relative">
                    {children}
                </main>
            </div>

            {/* Right Sidebar (World Info / Canon) */}
            <div className="z-20 h-full w-[450px] bg-black/20 backdrop-blur-sm border-l border-white/10 shrink-0">
                <RightSidebar />
            </div>
        </div>
    );
};
