'use client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { can, type Action, type Module, type Role } from '@rbac';
import { api, getToken, setToken } from './api';

export interface Admin { id: string; email: string; role: Role; modules: Module[] }
interface Ctx { admin: Admin | null; loading: boolean; can: (m: Module, a?: Action) => boolean; logout: () => void }
const AuthCtx = createContext<Ctx>({ admin: null, loading: true, can: () => false, logout: () => {} });
export const useAdmin = () => useContext(AuthCtx);

/** Hiding UI is a convenience only; the API enforces the same RBAC matrix on every request. */
export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const router = useRouter();
  const q = useQuery({ queryKey: ['admin-me'], queryFn: () => api<Admin>('/admin/me'), enabled: typeof window !== 'undefined' && !!getToken(), retry: false, staleTime: 60_000 });
  const logout = () => { setToken(null); qc.clear(); router.replace('/login'); };
  useEffect(() => { const h = () => { qc.clear(); router.replace('/login'); }; window.addEventListener('admin-signed-out', h); return () => window.removeEventListener('admin-signed-out', h); }, [qc, router]);
  const admin = q.data ?? null;
  return <AuthCtx.Provider value={{ admin, loading: q.isLoading, can: (m, a = 'read') => (admin ? can(admin.role, m, a) : false), logout }}>{children}</AuthCtx.Provider>;
}
