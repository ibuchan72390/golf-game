import { type Scorecard, totalStrokes, relativeToPar, formatRelative } from '../sim/scorecard';

/** Render the scorecard grid into `root`. `currentIndex` highlights the active hole (-1 = none). */
export function renderScorecard(root: HTMLElement, card: Scorecard, currentIndex: number): void {
  const cell = 'flex:1;text-align:center;padding:6px 0;font-size:13px;';
  const cols = card.holes
    .map((h, i) => {
      const cur = i === currentIndex;
      const strokes = h.strokes === null ? '·' : String(h.strokes);
      const tone = h.strokes === null ? '#90a4ae' : h.strokes <= h.par ? '#66bb6a' : '#ef5350';
      return `
        <div ${cur ? 'data-current="true"' : ''} style="${cell}${cur ? 'background:rgba(255,202,40,.18);border-radius:6px;' : ''}">
          <div style="color:#90a4ae;font-size:10px;">${i + 1}</div>
          <div style="color:#cfd8dc;font-size:10px;">P${h.par}</div>
          <div style="color:${tone};font-weight:700;">${strokes}</div>
        </div>`;
    })
    .join('');
  root.innerHTML = `
    <div style="background:rgba(38,50,56,.95);border-radius:12px;padding:10px 12px;color:#fff;">
      <div style="display:flex;gap:2px;">${cols}</div>
      <div style="display:flex;justify-content:space-between;margin-top:8px;font-size:13px;border-top:1px solid #455a64;padding-top:6px;">
        <span>Total: <b id="sc-total">${totalStrokes(card)}</b></span>
        <span id="sc-relative" style="font-weight:800;color:#ffca28;">${formatRelative(relativeToPar(card))}</span>
      </div>
    </div>`;
}
