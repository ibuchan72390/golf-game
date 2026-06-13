// src/app/game.ts
import { resolveShot } from '../sim/shot';
import { BASE_LOADOUT } from '../sim/clubs';
import { meterMaxSpeed } from '../sim/powerScale';
import { SURFACE, surfaceAt, type HoleFile, type Surface } from '../course/format';
import type { ClubId, ClubLoadout, HoleState, ShotIntent, Vec3 } from '../sim/types';
import { TrajectoryPlayback } from '../render/playback';

export type GamePhase = 'aiming' | 'metering' | 'flying' | 'holed';

/** Render-side callbacks; the Game never touches Three.js or the DOM. */
export interface GameView {
  onStateChange(phase: GamePhase, hole: HoleState, club: ClubId): void;
  setBallPosition(p: Vec3): void;
  setAimDir(yaw: number): void;
  frameBall(): void;
  onLanding(p: Vec3): void;
}

export function makeHoleState(hole: HoleFile, seed: number): HoleState {
  return {
    seed,
    ballPos: { ...hole.tee },
    holePos: { ...hole.pin },
    holeRadius: 0.15,
    strokes: 0,
    holedOut: false,
    hole,
    lie: surfaceAt(hole, hole.tee.x, hole.tee.z),
  };
}

/** Putter on the green; sensible swap when stepping off it; otherwise keep choice. */
export function autoClub(lie: Surface, current: ClubId): ClubId {
  if (lie === SURFACE.green) return 'putter';
  if (current === 'putter') return 'iron7';
  return current;
}

export class Game {
  phase: GamePhase = 'aiming';
  hole: HoleState;
  aimDir: number;
  club: ClubId = 'driver';
  /** approximate ball velocity during flight (for the chase camera) */
  flightVelocity: Vec3 | null = null;
  private playback: TrajectoryPlayback | null = null;
  private pendingState: HoleState | null = null;
  private prevPos: Vec3 | null = null;
  private landed = false;

  constructor(seed: number, holeFile: HoleFile, private view: GameView, private readonly loadout: ClubLoadout = BASE_LOADOUT) {
    this.hole = makeHoleState(holeFile, seed);
    this.aimDir = this.aimToHole();
    this.syncView();
  }

  aimToHole(): number {
    const dx = this.hole.holePos.x - this.hole.ballPos.x;
    const dz = this.hole.holePos.z - this.hole.ballPos.z;
    return Math.atan2(dx, -dz);
  }

  distToPin(): number {
    return Math.hypot(this.hole.holePos.x - this.hole.ballPos.x, this.hole.holePos.z - this.hole.ballPos.z);
  }

  adjustAim(deltaYaw: number): void {
    if (this.phase !== 'aiming') return;
    this.aimDir += deltaYaw;
    this.view.setAimDir(this.aimDir);
  }

  setClub(club: ClubId): void {
    if (this.phase === 'flying' || this.phase === 'holed') return;
    this.club = club;
    this.view.onStateChange(this.phase, this.hole, this.club);
  }

  setPhase(phase: GamePhase): void {
    this.phase = phase;
    this.view.onStateChange(phase, this.hole, this.club);
  }

  performSwing(intent: ShotIntent): void {
    if (this.phase === 'flying' || this.phase === 'holed') return;
    const scaled: ShotIntent = {
      ...intent,
      power: intent.power * (meterMaxSpeed(intent.club, this.hole.lie, this.distToPin()) / this.loadout[intent.club].maxSpeed),
    };
    const result = resolveShot(this.hole, scaled, this.loadout);
    this.pendingState = result.newState;
    this.playback = new TrajectoryPlayback(result.trajectory);
    this.prevPos = { ...this.hole.ballPos };
    this.landed = false;
    this.setPhase('flying');
  }

  /** Advance playback by dt seconds (call from rAF loop or tests). */
  update(dt: number): void {
    if (this.phase !== 'flying' || !this.playback || !this.pendingState) return;
    const pos = this.playback.advance(dt);
    this.view.setBallPosition(pos);
    if (this.prevPos && dt > 0) {
      this.flightVelocity = { x: (pos.x - this.prevPos.x) / dt, y: (pos.y - this.prevPos.y) / dt, z: (pos.z - this.prevPos.z) / dt };
      if (!this.landed && this.flightVelocity.y < 0 && pos.y - this.pendingState.ballPos.y < 0.4) {
        this.landed = true;
        this.view.onLanding(pos);
      }
    }
    this.prevPos = { ...pos };
    if (this.playback.done) {
      this.hole = this.pendingState;
      this.playback = null;
      this.pendingState = null;
      this.flightVelocity = null;
      this.club = autoClub(this.hole.lie, this.club);
      this.aimDir = this.hole.holedOut ? this.aimDir : this.aimToHole();
      this.view.setAimDir(this.aimDir);
      this.view.setBallPosition(this.hole.ballPos);
      this.view.frameBall();
      this.setPhase(this.hole.holedOut ? 'holed' : 'aiming');
    }
  }

  rebindView(view: GameView): void {
    this.view = view;
  }

  syncToView(): void {
    this.syncView();
  }

  private syncView(): void {
    this.view.setBallPosition(this.hole.ballPos);
    this.view.setAimDir(this.aimDir);
    this.view.frameBall();
    this.view.onStateChange(this.phase, this.hole, this.club);
  }
}
