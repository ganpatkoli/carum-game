'use client';
import type { ReactNode } from 'react';
import { ErrorBox, Spinner } from './ui';

/** Loading / error / retry wrapper for every API-backed block. */
export function Query<T>({ q, children }: { q: { data: T | undefined; isLoading: boolean; error: unknown; refetch: () => unknown }; children: (d: T) => ReactNode }) {
  if (q.isLoading) return <Spinner />;
  if (q.error || q.data === undefined) return <ErrorBox error={q.error} onRetry={() => q.refetch()} />;
  return <>{children(q.data)}</>;
}
