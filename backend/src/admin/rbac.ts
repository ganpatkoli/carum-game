export type Role = 'SUPER_ADMIN' | 'ADMIN' | 'GAME_MANAGER' | 'SUPPORT_MANAGER' | 'FINANCE_MANAGER';

export const MODULES = [
  'dashboard', 'users', 'matches', 'suspicious_matches', 'game_settings', 'rules', 'rewards', 'missions', 'achievements',
  'inventory', 'leaderboards', 'ads', 'branding', 'notifications', 'reports', 'support', 'wallet', 'transactions',
  'purchases', 'analytics', 'admins', 'audit_logs',
] as const;
export type Module = (typeof MODULES)[number];
export type Action = 'read' | 'write';

const all = (...m: Module[]): Record<string, Action[]> => Object.fromEntries(m.map((x) => [x, ['read', 'write'] as Action[]]));
const ro = (...m: Module[]): Record<string, Action[]> => Object.fromEntries(m.map((x) => [x, ['read'] as Action[]]));

/** Role → module → allowed actions. Deny by default. */
export const PERMISSIONS: Record<Role, Partial<Record<Module, Action[]>>> = {
  SUPER_ADMIN: all(...MODULES),
  ADMIN: { ...all(...MODULES.filter((m) => m !== 'admins' && m !== 'audit_logs')), audit_logs: ['read'] },
  GAME_MANAGER: {
    ...ro('dashboard', 'users', 'matches', 'analytics'),
    ...all('suspicious_matches', 'game_settings', 'rules', 'rewards', 'missions', 'achievements', 'inventory', 'leaderboards', 'ads', 'branding', 'notifications'),
  },
  SUPPORT_MANAGER: { ...ro('dashboard', 'users', 'matches', 'suspicious_matches'), ...all('reports', 'support', 'notifications') },
  FINANCE_MANAGER: { ...ro('dashboard', 'users', 'analytics'), ...all('wallet', 'transactions', 'purchases'), ads: ['read'] },
};

export function can(role: Role, module: Module, action: Action = 'read'): boolean {
  return PERMISSIONS[role]?.[module]?.includes(action) ?? false;
}
export const visibleModules = (role: Role) => MODULES.filter((m) => can(role, m, 'read'));
