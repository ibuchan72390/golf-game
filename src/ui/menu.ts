import { scoreName } from '../sim/scoring';
import { type Scorecard, totalStrokes, relativeToPar, formatRelative } from '../sim/scorecard';
import { renderScorecard } from './scorecard';

const overlay =
  'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;background:linear-gradient(180deg,#6fc3f0,#cdeefb);pointer-events:auto;font-family:system-ui,sans-serif;';
const btn =
  'background:#1b5e20;color:#fff;border:none;border-radius:12px;padding:14px 28px;font-size:18px;font-weight:700;cursor:pointer;min-width:220px;';

export interface MenuCallbacks {
  onPlay(): void;
  onUpgrade(): void;
  onSettings(): void;
  onFriends?(): void;
}

export function showMenu(root: HTMLElement, cb: MenuCallbacks): void {
  const friendsBtn = cb.onFriends
    ? `<button id="menu-friends" style="${btn}background:#ef6c00;">Play with Friends</button>`
    : '';
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:46px;font-weight:900;color:#1b5e20;text-shadow:0 2px 0 #fff;">⛳ Goofy Golf</div>
      <button id="menu-play" style="${btn}">Play a Round</button>
      ${friendsBtn}
      <button id="menu-upgrade" style="${btn}background:#37474f;">Upgrade Clubs</button>
      <button id="menu-settings" style="${btn}background:#546e7a;">Settings</button>
    </div>`;
  (root.querySelector('#menu-play') as HTMLElement).onclick = cb.onPlay;
  (root.querySelector('#menu-upgrade') as HTMLElement).onclick = cb.onUpgrade;
  (root.querySelector('#menu-settings') as HTMLElement).onclick = cb.onSettings;
  if (cb.onFriends) {
    (root.querySelector('#menu-friends') as HTMLElement).onclick = cb.onFriends;
  }
}

export interface CuratedEntry {
  name: string;
  seed: number;
}

export function showCourseSelect(
  root: HTMLElement,
  curated: CuratedEntry[],
  onCourse: (seed: number) => void,
): void {
  const cards = curated
    .map((c, i) => `<button id="course-${i}" style="${btn}">${c.name}</button>`)
    .join('');
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:30px;font-weight:800;color:#1b5e20;">Choose a Course</div>
      ${cards}
      <button id="course-random" style="${btn}background:#37474f;">Random Round 🎲</button>
    </div>`;
  curated.forEach((c, i) => {
    (root.querySelector(`#course-${i}`) as HTMLElement).onclick = () => onCourse(c.seed);
  });
  // Deterministic-ish random seed from the wall clock, hashed to a small int.
  (root.querySelector('#course-random') as HTMLElement).onclick = () =>
    onCourse((Date.now() % 100000) + 1);
}

export function showHoleComplete(
  root: HTMLElement,
  index: number,
  strokes: number,
  par: number,
  onNext: () => void,
): void {
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:40px;font-weight:900;color:#1b5e20;">${scoreName(strokes, par)}</div>
      <div style="font-size:20px;color:#37474f;">Hole ${index + 1} · ${strokes} strokes (par ${par})</div>
      <button id="hole-next" style="${btn}">${index === 8 ? 'Finish Round' : 'Next Hole'}</button>
    </div>`;
  (root.querySelector('#hole-next') as HTMLElement).onclick = onNext;
}

export function showRoundSummary(
  root: HTMLElement,
  card: Scorecard,
  skillPointsEarned: number,
  onContinue: () => void,
): void {
  const scWrap = document.createElement('div');
  scWrap.style.cssText = 'width:min(92vw,640px);';
  renderScorecard(scWrap, card, -1);
  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:34px;font-weight:900;color:#1b5e20;">Round Complete</div>
      <div style="font-size:20px;color:#37474f;">${totalStrokes(card)} strokes · ${formatRelative(relativeToPar(card))}</div>
      <div id="summary-card"></div>
      <div style="font-size:22px;font-weight:800;color:#ff6f00;">+${skillPointsEarned} ⭐ skill points</div>
      <button id="summary-continue" style="${btn}">Continue</button>
    </div>`;
  (root.querySelector('#summary-card') as HTMLElement).appendChild(scWrap);
  (root.querySelector('#summary-continue') as HTMLElement).onclick = onContinue;
}
