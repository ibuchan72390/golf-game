// src/ui/hud.ts
import type { GamePhase } from '../app/game';
import type { ClubId, HoleState } from '../sim/types';
import type { SwingStage } from '../input/holdRelease';
import type { InputScheme } from '../save/profile';
import { CLUBS } from '../sim/clubs';
import { SURFACE } from '../course/format';
import { PROMPTS } from './prompts';
import { scoreName } from '../sim/scoring';

const LIE_NAMES = ['Fairway', 'Rough', 'Green', 'Sand'] as const;
const CLUB_IDS: ClubId[] = ['driver', 'iron7', 'wedge', 'putter'];

export interface Hud {
  update(phase: GamePhase, hole: HoleState, club: ClubId): void;
  setMeter(value: number, stage: SwingStage, scheme: InputScheme): void;
  onClubSelect(cb: (club: ClubId) => void): void;
  onGear(cb: () => void): void;
}

const chip = 'background:rgba(38,50,56,.88);color:#fff;padding:7px 14px;border-radius:16px;font-size:14px;font-weight:600;';

export function createHud(root: HTMLElement): Hud {
  root.innerHTML = `
    <div id="hud-top" style="position:absolute;top:12px;left:12px;${chip}"></div>
    <div id="hud-lie" style="position:absolute;top:12px;left:50%;transform:translateX(-50%);${chip}color:#ffca28;"></div>
    <button id="hud-gear" style="position:absolute;top:12px;right:12px;${chip}border:none;pointer-events:auto;cursor:pointer;">⚙</button>
    <div id="hud-msg" style="position:absolute;top:38%;width:100%;text-align:center;color:#fff;font-size:46px;font-weight:800;text-shadow:0 3px 10px rgba(0,0,0,.45);display:none;"></div>
    <div id="hud-clubs" style="position:absolute;bottom:84px;left:12px;display:flex;gap:6px;pointer-events:auto;"></div>
    <div id="hud-prompt" style="position:absolute;bottom:52px;left:12px;width:260px;text-align:center;color:#ffca28;font-size:13px;font-weight:800;letter-spacing:.05em;text-shadow:0 1px 4px rgba(0,0,0,.5);animation:hudpulse 1.2s ease-in-out infinite;"></div>
    <div id="hud-meter" style="position:absolute;bottom:18px;left:12px;width:260px;height:22px;background:#263238;border-radius:11px;border:2px solid rgba(255,255,255,.25);">
      <div id="hud-meter-band" style="position:absolute;left:44%;width:12%;top:0;height:100%;background:rgba(102,187,106,.55);border-radius:4px;display:none;"></div>
      <div id="hud-meter-target" style="position:absolute;left:10%;top:-4px;width:3px;height:28px;background:#ffca28;"></div>
      <div id="hud-meter-fill" style="position:absolute;left:0;top:0;height:100%;width:0%;background:linear-gradient(90deg,#66bb6a,#ffca28,#ef5350);border-radius:9px;"></div>
    </div>
    <div id="hud-help" style="position:absolute;bottom:18px;right:12px;color:rgba(255,255,255,.9);font-size:12px;text-align:right;">←/→ aim · 1-4 club</div>
    <style>@keyframes hudpulse{0%,100%{opacity:1}50%{opacity:.55}}</style>
  `;
  const get = (id: string) => root.querySelector(id) as HTMLElement;
  const top = get('#hud-top'), lieEl = get('#hud-lie'), msg = get('#hud-msg');
  const prompt = get('#hud-prompt'), fill = get('#hud-meter-fill');
  const band = get('#hud-meter-band'), target = get('#hud-meter-target');
  const clubsEl = get('#hud-clubs'), gear = get('#hud-gear');

  let clubCb: (club: ClubId) => void = () => {};
  let gearCb: () => void = () => {};
  for (const id of CLUB_IDS) {
    const b = document.createElement('button');
    b.id = `club-${id}`;
    b.textContent = CLUBS[id].name;
    b.style.cssText = `${chip}border:none;cursor:pointer;font-size:12px;`;
    b.addEventListener('click', () => clubCb(id));
    clubsEl.appendChild(b);
  }
  gear.addEventListener('click', () => gearCb());

  return {
    update(phase, hole, club) {
      const dist = Math.hypot(hole.holePos.x - hole.ballPos.x, hole.holePos.z - hole.ballPos.z);
      top.textContent = `Par ${hole.hole.par} · Strokes: ${hole.strokes} · ⛳ ${dist.toFixed(0)} m`;
      top.dataset.strokes = String(hole.strokes);
      top.dataset.phase = phase;
      lieEl.textContent = LIE_NAMES[hole.lie] ?? '';
      lieEl.style.display = hole.lie === SURFACE.fairway || phase === 'holed' ? 'none' : 'block';
      msg.style.display = phase === 'holed' ? 'block' : 'none';
      msg.textContent = phase === 'holed' ? scoreName(hole.strokes, hole.hole.par) : '';
      for (const id of CLUB_IDS) {
        const b = root.querySelector(`#club-${id}`) as HTMLElement;
        b.style.background = id === club ? '#ffca28' : 'rgba(38,50,56,.88)';
        b.style.color = id === club ? '#263238' : '#fff';
      }
    },
    setMeter(value, stage, scheme) {
      fill.style.width = `${(value * 100).toFixed(1)}%`;
      fill.style.opacity = stage === 'ready' ? '0.35' : '1';
      prompt.textContent = PROMPTS[scheme][stage];
      band.style.display = stage === 'contact' && scheme === 'holdRelease' ? 'block' : 'none';
      target.style.display = scheme === 'threeClick' ? 'block' : 'none';
    },
    onClubSelect(cb) {
      clubCb = cb;
    },
    onGear(cb) {
      gearCb = cb;
    },
  };
}
