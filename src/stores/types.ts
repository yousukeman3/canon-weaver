import { Canon, Chronicle } from "@/lib/domain/schema";
import { ChatNodeId, ChatTree } from '@/lib/llm/chatTree';
import { GeminiConfig } from '@/lib/llm/gemini';
import { ChatSessionMetadata } from '@/lib/persistence';
import { StateCreator } from 'zustand';

export interface UISlice {
    sidebarOpen: boolean;
    worldInfoOpen: boolean;
    rightSidebarMode: 'state' | 'canon';
    setSidebarOpen: (open: boolean) => void;
    setWorldInfoOpen: (open: boolean) => void;
    setRightSidebarMode: (mode: 'state' | 'canon') => void;
}

export interface SessionSlice {
    currentSessionId: string | null;
    sessions: ChatSessionMetadata[];
    isSessionLoading: boolean;
    loadSessions: () => Promise<void>;
    createSession: () => Promise<string | undefined>;
    loadSession: (sessionId: string) => Promise<void>;
    saveSession: () => Promise<void>;
    generateTitle: () => Promise<void>;
    renameSession: (sessionId: string, newTitle: string) => Promise<void>;
    deleteSession: (sessionId: string) => Promise<void>;
    ensureSession: () => Promise<string | undefined>;
}

export interface ChatSlice {
    tree: ChatTree;
    isGenerating: boolean;
    config: GeminiConfig;
    sendMessage: (text: string) => Promise<void>;
    regenerate: (nodeId?: ChatNodeId) => Promise<void>;
    navigateBranch: (nodeId: ChatNodeId, direction: 'prev' | 'next') => void;
    editMessage: (nodeId: ChatNodeId, newText: string) => Promise<void>;
    updateConfig: (config: Partial<GeminiConfig>) => void;
    initialize: () => void;
}

export interface CanonSlice {
    canonDrafts: any[]; // Using any to match original structure
    isCurating: boolean;
    canon?: Canon;
    chronicle?: Chronicle;
    setCanon: (canon: Canon) => void;
    setChronicle: (chronicle: Chronicle) => void;
    updatePlayerName: (name: string) => void;
    runCuration: () => Promise<void>;
    approveCanonDraft: (index: number) => void;
    rejectCanonDraft: (index: number) => void;
    addCanonEntry: (entry: Omit<Canon['entries'][0], 'id'>) => Promise<void>;
    updateCanonEntry: (id: string, updates: Partial<Canon['entries'][0]>) => Promise<void>;
    deleteCanonEntry: (id: string) => Promise<void>;
    updateGlobalRules: (rules: string[]) => Promise<void>;
    wrapUpChapter: () => Promise<void>;
}

export type ChatStore = UISlice & SessionSlice & ChatSlice & CanonSlice;

export type StoreSlice<T> = StateCreator<ChatStore, [], [], T>;
