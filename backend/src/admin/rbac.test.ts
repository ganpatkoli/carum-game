import { describe, expect, it } from 'vitest';
import { can, visibleModules } from './rbac';

describe('admin RBAC', () => {
  it('super admin can do everything', () => {
    expect(can('SUPER_ADMIN', 'admins', 'write')).toBe(true);
  });
  it('only super admin manages admins', () => {
    for (const r of ['ADMIN', 'GAME_MANAGER', 'SUPPORT_MANAGER', 'FINANCE_MANAGER'] as const) expect(can(r, 'admins', 'read')).toBe(false);
  });
  it('finance cannot change game rules; game manager cannot touch wallets', () => {
    expect(can('FINANCE_MANAGER', 'rules', 'write')).toBe(false);
    expect(can('GAME_MANAGER', 'wallet', 'read')).toBe(false);
    expect(can('GAME_MANAGER', 'rules', 'write')).toBe(true);
  });
  it('support handles reports and tickets but cannot adjust coins', () => {
    expect(can('SUPPORT_MANAGER', 'support', 'write')).toBe(true);
    expect(can('SUPPORT_MANAGER', 'transactions', 'write')).toBe(false);
  });
  it('read-only grants do not imply write; menus hide forbidden modules', () => {
    expect(can('GAME_MANAGER', 'users', 'write')).toBe(false);
    expect(visibleModules('SUPPORT_MANAGER')).not.toContain('wallet');
  });
});
