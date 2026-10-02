/** Level curve: level n needs 100·(n-1)² total XP (L2=100, L3=400, L5=1600 …). */
export const xpForLevel = (level: number) => 100 * (level - 1) ** 2;
export const levelForXp = (xp: number) => Math.max(1, Math.floor(Math.sqrt(Math.max(0, xp) / 100)) + 1);
