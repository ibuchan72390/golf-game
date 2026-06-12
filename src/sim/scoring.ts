export function scoreName(strokes: number, par: number): string {
  if (strokes === 1) return 'Ace!';
  const diff = strokes - par;
  if (diff <= -3) return 'Albatross!';
  if (diff === -2) return 'Eagle!';
  if (diff === -1) return 'Birdie!';
  if (diff === 0) return 'Par';
  if (diff === 1) return 'Bogey';
  if (diff === 2) return 'Double Bogey';
  return `+${diff}`;
}
