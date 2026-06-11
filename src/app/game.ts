// src/app/game.ts
import { resolveShot } from '../sim/shot';
import type { HoleState, ShotIntent, Vec3 } from '../sim/types';
import { TrajectoryPlayback } from '../render/playback';

export type GamePhase = 'aiming' | 'metering' | 'flying' | 'holed';

/** Render-side callbacks; the Game never touches Three.js or the DOM. */
export interface GameView {
  onStateChange(phase: GamePhase, hole: HoleState): void;
  setBallPosition(p: Vec3): void;
  setAimDir(yaw: number): void;
  frameBall(): void;
}

export function makeFlatHole(seed: number): HoleState {
  return {
    seed,
    ballPos: { x: 0, y: 0, z: 0 },
    holePos: { x: 0, y: 0, z: -150 },
    holeRadius: 0.15,
    strokes: 0,
    holedOut: false,
  };
}

export class Game {
  phase: GamePhase = 'aiming';
  hole: HoleState;
  aimDir: number;
  private playback: TrajectoryPlayback | null = null;
  private pendingState: HoleState | null = null;

  constructor(seed: number, private readonly view: GameView) {
    this.hole = makeFlatHole(seed);
    this.aimDir = this.aimToHole();
    this.syncView();
  }

  aimToHole(): number {
    const dx = this.hole.holePos.x - this.hole.ballPos.x;
    const dz = this.hole.holePos.z - this.hole.ballPos.z;
    return Math.atan2(dx, -dz);
  }

  adjustAim(deltaYaw: number): void {
    if (this.phase !== 'aiming') return;
    this.aimDir += deltaYaw;
    this.view.setAimDir(this.aimDir);
    this.view.frameBall();
  }

  setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.view.onStateChange(phase, this.hole);
  }

  performSwing(intent: ShotIntent): void {
    if (this.phase === 'flying' || this.phase === 'holed') return;
    const result = resolveShot(this.hole, intent);
    this.pendingState = result.newState;
    this.playback = new TrajectoryPlayback(result.trajectory);
    this.setPhase('flying');
  }

  /** Advance playback by dt seconds (call from rAF loop or tests). */
  update(dt: number): void {
    if (this.phase !== 'flying' || !this.playback || !this.pendingState) return;
    const pos = this.playback.advance(dt);
    this.view.setBallPosition(pos);
    if (this.playback.done) {
      this.hole = this.pendingState;
      this.playback = null;
      this.pendingState = null;
      this.aimDir = this.hole.holedOut ? this.aimDir : this.aimToHole();
      this.view.setAimDir(this.aimDir);
      this.view.setBallPosition(this.hole.ballPos);
      this.view.frameBall();
      this.setPhase(this.hole.holedOut ? 'holed' : 'aiming');
    }
  }

  private syncView(): void {
    this.view.setBallPosition(this.hole.ballPos);
    this.view.setAimDir(this.aimDir);
    this.view.frameBall();
    this.view.onStateChange(this.phase, this.hole);
  }
}
