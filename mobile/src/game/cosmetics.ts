import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';
import { useAuth } from '../store/auth';

export interface ShopItem { id: string; category: 'STRIKER' | 'BOARD' | 'AVATAR' | 'FRAME' | 'EFFECT' | 'EMOTE'; name: string; price: number; rarity: string; meta: Record<string, any>; owned: boolean; equipped: boolean; status: string }

/** Equipped striker colour and board theme; falls back to the free defaults when offline. */
export function useCosmetics() {
  const signedIn = useAuth((s) => s.status === 'signedIn');
  const q = useQuery({ queryKey: ['inventory'], queryFn: () => api<ShopItem[]>('/inventory'), staleTime: 60_000, retry: false, enabled: signedIn });
  const eq = (c: ShopItem['category']) => q.data?.find((i) => i.category === c && i.equipped);
  return { strikerColor: eq('STRIKER')?.meta?.color as string | undefined, boardTheme: eq('BOARD')?.meta?.theme as string | undefined };
}
