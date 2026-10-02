export const theme = {
  bg: '#14110f', card: '#221b16', card2: '#2e251d', text: '#f7f1e8', muted: '#a99c8c', gold: '#f2b705', wood: '#b9651f', woodDark: '#7a4410',
  red: '#e5484d', green: '#3fb950', blue: '#4aa8ff', border: '#3a2e24',
  radius: 16,
} as const;

/** Board skins. Extra skins can be added server-side by shipping a `meta.theme` id that exists here. */
export const boardThemes = {
  classic: { surface: '#f0cf93', frame: '#8a4f1c', line: '#3a2410' },
  royal: { surface: '#e4cdf0', frame: '#4b2a6e', line: '#2a1040' },
  neon: { surface: '#0b1020', frame: '#00bcd4', line: '#ff2bd6' },
  dark: { surface: '#3a3d45', frame: '#14161b', line: '#9aa0ac' },
  premium: { surface: '#f4dfae', frame: '#b8860b', line: '#5a3a00' },
  tournament: { surface: '#f5deb3', frame: '#2b2b2b', line: '#111111' },
} as const;
export type BoardThemeId = keyof typeof boardThemes;
export const boardThemeOf = (id?: string): BoardThemeId => (id && id in boardThemes ? (id as BoardThemeId) : 'classic');

export const AVATARS = ['😎', '🤠', '🦊', '🐯', '🤖', '👑'] as const;
export const AVATAR_BG = ['#3d5a80', '#8a5a2b', '#c4572a', '#b8860b', '#4f5d75', '#6d3fa8'] as const;
export const avatarIndex = (id?: string) => Math.max(0, Math.min(AVATARS.length - 1, (parseInt((id ?? '').replace(/\D/g, ''), 10) || 1) - 1));
