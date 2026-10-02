import { useQuery } from '@tanstack/react-query';
import { api } from '../api/client';

export interface MissionRow { id: string; title: string; metric: string; target: number; rewardCoins: number; progress: number; claimed: boolean; claimable: boolean }
export interface DailyStatus { rewards: number[]; canClaim: boolean; nextDay: number; streak: number; claimedToday: boolean }
export interface LbRow { rank: number; userId: string; username: string; avatarId: string; imageUrl: string | null; rating: number; wins: number; xp: number; level: number; periodWins?: number; ratingGain?: number }
export interface Leaderboard { board: string; rows: LbRow[]; me: LbRow | null }

export const useMissions = () => useQuery({ queryKey: ['missions'], queryFn: () => api<MissionRow[]>('/missions') });
export const useDaily = () => useQuery({ queryKey: ['daily'], queryFn: () => api<DailyStatus>('/rewards/daily') });
export const useLeaderboard = (type: string, limit = 50) => useQuery({ queryKey: ['leaderboard', type, limit], queryFn: () => api<Leaderboard>(`/leaderboard?type=${type}&limit=${limit}`) });
export const useUnread = () => useQuery({ queryKey: ['notifications', 'unread'], queryFn: () => api<{ unread: number }>('/notifications?limit=1'), refetchInterval: 60_000 });
