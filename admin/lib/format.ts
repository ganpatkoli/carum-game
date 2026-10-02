export const fmtDate = (d?: string | Date | null) => (d ? new Date(d).toLocaleString() : '—');
export const fmtNum = (n?: number | null) => (n === undefined || n === null ? '—' : n.toLocaleString());
export const titleCase = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());

export const ticketTone = (s: string) => (s === 'OPEN' ? 'amber' : s === 'IN_PROGRESS' ? 'blue' : s === 'RESOLVED' ? 'green' : 'gray') as 'amber' | 'blue' | 'green' | 'gray';
