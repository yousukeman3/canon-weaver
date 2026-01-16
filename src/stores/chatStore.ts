import { create } from 'zustand';
import { createCanonSlice } from './slices/createCanonSlice';
import { createChatSlice } from './slices/createChatSlice';
import { createSessionSlice } from './slices/createSessionSlice';
import { createUISlice } from './slices/createUISlice';
import { ChatStore } from './types';

export const useChatStore = create<ChatStore>()((...a) => ({
    ...createUISlice(...a),
    ...createSessionSlice(...a),
    ...createChatSlice(...a),
    ...createCanonSlice(...a),
}));
