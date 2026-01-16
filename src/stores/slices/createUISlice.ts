import { StoreSlice, UISlice } from "../types";

export const createUISlice: StoreSlice<UISlice> = (set) => ({
    sidebarOpen: true,
    worldInfoOpen: false,
    rightSidebarMode: 'state',
    setSidebarOpen: (open) => set({ sidebarOpen: open }),
    setWorldInfoOpen: (open) => set({ worldInfoOpen: open }),
    setRightSidebarMode: (mode) => set({ rightSidebarMode: mode }),
});
