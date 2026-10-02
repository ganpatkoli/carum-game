import { create } from 'zustand';
import { api, ApiError, getRefreshToken, loadTokens, saveTokens, setSignedOutHandler, type Tokens } from '../api/client';
import { disconnectSocket } from '../net/socket';

export interface Me {
  id: string; playerId: string; email: string | null; phone: string | null;
  profile: {
    name: string; username: string; avatarId: string; imageUrl: string | null; country: string | null; language: string; level: number; xp: number; xpIntoLevel: number; xpForNext: number;
    matchesPlayed: number; matchesWon: number; matchesLost: number; draws: number; bestScore: number; currentStreak: number; longestStreak: number; winRate: number; profileComplete: boolean;
    privacy: { hideStats?: boolean; hideOnline?: boolean; friendRequests?: 'everyone' | 'nobody' }; notifPrefs: Record<string, boolean>;
  };
  rating: { rating: number; previous: number; lastChange: number; highest: number; lowest: number };
  ranking: number;
  wallet: { balance: number; earned: number; spent: number };
  balance: number;
  equipped: string[];
  achievementsUnlocked: number;
}

interface AuthState {
  status: 'loading' | 'signedOut' | 'signedIn';
  me: Me | null;
  bootstrap: () => Promise<void>;
  refreshMe: () => Promise<Me | null>;
  signInWithTokens: (t: Tokens) => Promise<void>;
  login: (identifier: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

export const useAuth = create<AuthState>((set, get) => ({
  status: 'loading',
  me: null,
  async bootstrap() {
    setSignedOutHandler(() => { disconnectSocket(); set({ status: 'signedOut', me: null }); });
    const t = await loadTokens();
    if (!t) return set({ status: 'signedOut' });
    try { set({ me: await api<Me>('/me'), status: 'signedIn' }); }
    catch (e) {
      // offline at launch: stay signed in with whatever we can (practice mode still works); only an auth failure signs out
      if (e instanceof ApiError && (e.status === 401 || e.status === 403)) { await saveTokens(null); set({ status: 'signedOut' }); }
      else set({ status: 'signedIn' });
    }
  },
  async refreshMe() {
    try { const me = await api<Me>('/me'); set({ me }); return me; } catch { return get().me; }
  },
  async signInWithTokens(t) {
    await saveTokens({ accessToken: t.accessToken, refreshToken: t.refreshToken });
    set({ me: await api<Me>('/me'), status: 'signedIn' });
  },
  async login(identifier, password) {
    const t = await api<Tokens>('/auth/login', { json: { identifier, password } });
    await get().signInWithTokens(t);
  },
  async logout() {
    const rt = getRefreshToken();
    if (rt) await api('/auth/logout', { json: { refreshToken: rt } }).catch(() => {});
    disconnectSocket();
    await saveTokens(null);
    set({ status: 'signedOut', me: null });
  },
}));
