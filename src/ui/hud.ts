// src/ui/hud.ts
import type { GamePhase } from '../app/game';
import type { ClubId, HoleState } from '../sim/types';
import { CLUBS } from '../sim/clubs';

export interface Hud {
  update(phase: GamePhase, hole: HoleState, club: ClubId): void;
  setMeter(visible: boolean, value: number): void;
}

export function createHud(root: HTMLElement): Hud {
  root.innerHTML = `
    <div id="hud-top" style="position:absolute;top:12px;left:12px;background:rgba(38,50,56,.85);color:#fff;padding:6px 14px;border-radius:14px;font-size:14px;"></div>
    <div id="hud-club" style="position:absolute;bottom:64px;left:12px;background:rgba(38,50,56,.85);color:#ffca28;padding:6px 14px;border-radius:14px;font-size:14px;"></div>
    <div id="hud-msg" style="position:absolute;top:40%;width:100%;text-align:center;color:#fff;font-size:42px;font-weight:700;text-shadow:0 2px 8px rgba(0,0,0,.4);display:none;"></div>
    <div id="hud-meter" style="position:absolute;bottom:18px;left:12px;width:240px;height:18px;background:#263238;border-radius:9px;display:none;">
      <div style="position:absolute;left:10%;top:-3px;width:3px;height:24px;background:#ffca28;"></div>
      <div id="hud-meter-fill" style="position:absolute;left:0;top:0;height:100%;width:0%;background:linear-gradient(90deg,#66bb6a,#ffca28,#ef5350);border-radius:9px;"></div>
    </div>
    <div id="hud-help" style="position:absolute;bottom:18px;right:12px;color:rgba(255,255,255,.9);font-size:12px;text-align:right;">←/→ aim · space/click/tap: start meter, set power, set accuracy</div>
  `;
  const top = root.querySelector('#hud-top') as HTMLElement;
  const clubEl = root.querySelector('#hud-club') as HTMLElement;
  const msg = root.querySelector('#hud-msg') as HTMLElement;
  const meter = root.querySelector('#hud-meter') as HTMLElement;
  const fill = root.querySelector('#hud-meter-fill') as HTMLElement;

  return {
    update(phase, hole, club) {
      const dist = Math.hypot(
        hole.holePos.x - hole.ballPos.x,
        hole.holePos.z - hole.ballPos.z,
      );
      top.textContent = `Strokes: ${hole.strokes} · ⛳ ${dist.toFixed(0)} m`;
      top.dataset.strokes = String(hole.strokes);
      top.dataset.phase = phase;
      clubEl.textContent = CLUBS[club].name;
      msg.style.display = phase === 'holed' ? 'block' : 'none';
      msg.textContent = phase === 'holed' ? `In! ${hole.strokes} strokes` : '';
    },
    setMeter(visible, value) {
      meter.style.display = visible ? 'block' : 'none';
      fill.style.width = `${(value * 100).toFixed(1)}%`;
    },
  };
}
