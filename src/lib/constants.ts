import { ThinkingLevel } from "@google/genai";

export const DEFAULT_SYSTEM_PROMPT = `You are a creative roleplay partner. Write in a vivid, engaging style.`;

export const DEFAULT_GEMINI_CONFIG = {
    model: "gemini-3-flash-preview",
    temperature: 0.7,
    presencePenalty: 0.0,
    frequencyPenalty: 0.0,
    thinkingLevel: ThinkingLevel.MEDIUM,
    includeThoughts: true,
};

export const API_ENDPOINTS = {
    CHAT: '/api/chat',
    SESSIONS: '/api/sessions', // GET list, POST create
    SESSION_DETAIL: (id: string) => `/api/sessions/${id}`, // GET, PUT, DELETE, PATCH
    TITLE_GEN: '/api/title',
    CURATE: '/api/curate',
    CHRONICLE_CHAPTER: '/api/chronicle/chapter',
};
