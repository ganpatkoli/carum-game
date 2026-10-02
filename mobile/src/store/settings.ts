import AsyncStorage from '@react-native-async-storage/async-storage';
import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

interface SettingsState {
  sound: boolean; music: boolean; vibration: boolean;
  /** player ids whose in-game chat/emotes are hidden on this device */
  muted: string[];
  toggle: (k: 'sound' | 'music' | 'vibration') => void;
  toggleMute: (id: string) => void;
}

export const useSettings = create<SettingsState>()(persist((set) => ({
  sound: true, music: true, vibration: true, muted: [],
  toggle: (k) => set((s) => ({ [k]: !s[k] }) as Partial<SettingsState>),
  toggleMute: (id) => set((s) => ({ muted: s.muted.includes(id) ? s.muted.filter((x) => x !== id) : [...s.muted, id] })),
}), { name: 'settings', storage: createJSONStorage(() => AsyncStorage) }));
