export function expectedScore(ra: number, rb: number) {
  return 1 / (1 + 10 ** ((rb - ra) / 400));
}

/** K shrinks as players become established. */
export function kFactor(matchesPlayed: number) {
  return matchesPlayed < 30 ? 40 : matchesPlayed < 100 ? 24 : 16;
}

/** result: 1 win, 0.5 draw, 0 loss. Returns the signed rating change for `a`. */
export function ratingDelta(ra: number, rb: number, result: 0 | 0.5 | 1, matchesPlayedA: number) {
  return Math.round(kFactor(matchesPlayedA) * (result - expectedScore(ra, rb)));
}
