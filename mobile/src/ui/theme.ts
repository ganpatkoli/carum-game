export const theme = { bg: '#0f1115', card: '#1b1f27', text: '#f4f1ea', muted: '#9aa0aa', gold: '#f2b705', wood: '#c58b4a', red: '#d62839' };

/** Board skins — more can be delivered from the admin panel. */
export const boardThemes = {
  classic: { surface: '#f0cf93', frame: '#8a4f1c', line: '#3a2410' },
  royal: { surface: '#d9b8e8', frame: '#4b2a6e', line: '#2a1040' },
  neon: { surface: '#0b1020', frame: '#00e5ff', line: '#ff2bd6' },
  dark: { surface: '#2a2d34', frame: '#111318', line: '#8a8f99' },
  premium: { surface: '#f0d9a3', frame: '#b8860b', line: '#5a3a00' },
  tournament: { surface: '#f5deb3', frame: '#222', line: '#111' },
} as const;
