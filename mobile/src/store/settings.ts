import { create } from 'zustand';

export const useSettings = create<{ sound: boolean; music: boolean; vibration: boolean; toggle: (k: 'sound' | 'music' | 'vibration') => void }>((set) => ({
  sound: true, music: true, vibration: true,
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as any),
}));
