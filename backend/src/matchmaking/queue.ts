export interface QueueEntry {
  userId: string;
  rating: number;
  level: number;
  region: string;
  latencyMs: number;
  joinedAt: number;
}

/** Acceptable rating gap grows with waiting time: 100 → up to 600. */
export function allowedGap(waitedMs: number) {
  return Math.min(600, 100 + Math.floor(waitedMs / 5000) * 50);
}

function compatible(a: QueueEntry, b: QueueEntry, now: number) {
  if (a.userId === b.userId) return false;
  const gap = Math.min(allowedGap(now - a.joinedAt), allowedGap(now - b.joinedAt)) ;
  const wide = Math.max(allowedGap(now - a.joinedAt), allowedGap(now - b.joinedAt));
  // either player's widened window is enough once the other has also waited a while
  if (Math.abs(a.rating - b.rating) > Math.max(gap, wide - 100)) return false;
  // same region preferred; cross-region only after 15s
  if (a.region !== b.region && Math.min(now - a.joinedAt, now - b.joinedAt) < 15_000) return false;
  if (Math.max(a.latencyMs, b.latencyMs) > 400 && Math.min(now - a.joinedAt, now - b.joinedAt) < 20_000) return false;
  return true;
}

export class MatchQueue {
  private entries = new Map<string, QueueEntry>();
  add(e: QueueEntry) { this.entries.set(e.userId, e); }
  remove(userId: string) { return this.entries.delete(userId); }
  has(userId: string) { return this.entries.has(userId); }
  get size() { return this.entries.size; }

  /** Remove and return everyone who has waited at least `ms` (used to fill with a bot opponent). */
  takeWaiting(ms: number, now = Date.now()): QueueEntry[] {
    const out = [...this.entries.values()].filter((e) => now - e.joinedAt >= ms);
    for (const e of out) this.entries.delete(e.userId);
    return out;
  }

  /** Longest-waiting players are paired first, each with their closest-rated compatible opponent. */
  findPairs(now = Date.now()): [QueueEntry, QueueEntry][] {
    const pairs: [QueueEntry, QueueEntry][] = [];
    const pool = [...this.entries.values()].sort((a, b) => a.joinedAt - b.joinedAt);
    const used = new Set<string>();
    for (const a of pool) {
      if (used.has(a.userId)) continue;
      let best: QueueEntry | null = null;
      for (const b of pool) {
        if (used.has(b.userId) || !compatible(a, b, now)) continue;
        if (!best || Math.abs(a.rating - b.rating) < Math.abs(a.rating - best.rating)) best = b;
      }
      if (best) {
        used.add(a.userId); used.add(best.userId);
        pairs.push([a, best]);
      }
    }
    for (const [a, b] of pairs) { this.entries.delete(a.userId); this.entries.delete(b.userId); }
    return pairs;
  }
}
