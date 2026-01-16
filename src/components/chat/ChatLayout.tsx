import { useChatStore } from '@/stores/chatStore';
import { clsx } from 'clsx';
import { BookOpen, Menu, X } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import React from 'react';
import { RightSidebar } from './RightSidebar';
import { Sidebar } from './Sidebar';


export const ChatLayout = ({ children }: { children: React.ReactNode }) => {
    const sidebarOpen = useChatStore(s => s.sidebarOpen);
    const setSidebarOpen = useChatStore(s => s.setSidebarOpen);
    const worldInfoOpen = useChatStore(s => s.worldInfoOpen);
    const setWorldInfoOpen = useChatStore(s => s.setWorldInfoOpen);
    const loadSessions = useChatStore(s => s.loadSessions);
    const currentSessionId = useChatStore(s => s.currentSessionId);
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

            {/* Mobile Backdrop for Left Sidebar */}
            {sidebarOpen && (
                <div
                    className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
                    onClick={() => setSidebarOpen(false)}
                />
            )}

            {/* Left Sidebar (Session List) */}
            <div
                className={clsx(
                    "fixed inset-y-0 left-0 z-30 h-full bg-black/80 md:bg-black/50 border-r border-white/10 transition-[transform,width,opacity] duration-300 ease-in-out backdrop-blur-md",
                    // Mobile: Slide in/out
                    "md:relative md:translate-x-0",
                    sidebarOpen ? "translate-x-0 w-[280px] md:w-[320px] md:opacity-100" : "-translate-x-full md:translate-x-0 md:w-0 md:opacity-0 md:overflow-hidden"
                )}
            >
                <Sidebar />
            </div>

            {/* Main Content */}
            <div className="relative z-10 flex flex-1 flex-col h-full overflow-hidden w-full">
                {/* Header / Toggle */}
                <header className="flex h-12 items-center justify-between px-4 border-b border-white/5 bg-transparent shrink-0">
                    <div className="flex items-center gap-2">
                        {/* Always show menu button on mobile if closed, or desktop if closed */}
                        <button
                            onClick={() => setSidebarOpen(true)}
                            className={clsx(
                                "p-2 rounded-md hover:bg-white/10 text-white/70 transition-colors",
                                sidebarOpen ? "hidden md:hidden" : "block" // Hide when open (Sidebar has close btn), but logic is tricky. Sidebar X closes it.
                                // Actually, on mobile, if sidebar is open, it functions as drawer. 
                                // On desktop, if sidebar is open, we hide this button to avoid dup.
                            )}
                        >
                            <Menu size={20} />
                        </button>
                    </div>

                    {/* Right Sidebar Toggle (Mobile Only) */}
                    <button
                        onClick={() => setWorldInfoOpen(!worldInfoOpen)}
                        className={clsx(
                            "p-2 rounded-md hover:bg-white/10 text-white/70 transition-colors md:hidden",
                            worldInfoOpen ? "text-purple-400" : ""
                        )}
                    >
                        {worldInfoOpen ? <X size={20} /> : <BookOpen size={20} />}
                    </button>

                </header>

                {/* Chat Area */}
                <main className="flex-1 overflow-hidden relative">
                    {children}
                </main>
            </div>

            {/* Mobile Backdrop for Right Sidebar */}
            {worldInfoOpen && (
                <div
                    className="fixed inset-0 z-20 bg-black/60 backdrop-blur-sm md:hidden"
                    onClick={() => setWorldInfoOpen(false)}
                />
            )}

            {/* Right Sidebar (World Info / Canon) */}
            <div className={clsx(
                "fixed inset-y-0 right-0 z-30 h-full w-[85%] max-w-[450px] bg-black/90 md:bg-black/20 backdrop-blur-md border-l border-white/10 transition-transform duration-300 ease-in-out",
                "md:relative md:translate-x-0 md:w-[450px] md:block",
                worldInfoOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"
            )}>
                <RightSidebar />
            </div>
        </div>
    );
};
