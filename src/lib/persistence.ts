import { Canon, Chronicle } from "./domain/schema";
import { ChatTree } from "./llm/chatTree";
import { GeminiConfig } from "./llm/gemini";

export interface ChatSession {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
    tree: ChatTree;
    config: GeminiConfig;
    systemPrompt: string;
    canon?: Canon;
    chronicle?: Chronicle;
}

export interface ChatSessionMetadata {
    id: string;
    title: string;
    createdAt: string;
    updatedAt: string;
}
