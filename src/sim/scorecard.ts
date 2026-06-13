export interface HoleScore {
  par: 3 | 4 | 5;
  /** null until the hole is completed */
  strokes: number | null;
}

export interface Scorecard {
  holes: HoleScore[];
}

export function makeScorecard(pars: (3 | 4 | 5)[]): Scorecard {
  return { holes: pars.map((par) => ({ par, strokes: null })) };
}

export function recordHole(card: Scorecard, index: number, strokes: number): Scorecard {
  return {
    holes: card.holes.map((h, i) => (i === index ? { ...h, strokes } : h)),
  };
}

export function totalStrokes(card: Scorecard): number {
  return card.holes.reduce((s, h) => s + (h.strokes ?? 0), 0);
}

export function parThroughPlayed(card: Scorecard): number {
  return card.holes.reduce((s, h) => s + (h.strokes !== null ? h.par : 0), 0);
}

export function relativeToPar(card: Scorecard): number {
  return totalStrokes(card) - parThroughPlayed(card);
}

export function formatRelative(n: number): string {
  if (n === 0) return 'E';
  return n > 0 ? `+${n}` : `${n}`;
}
