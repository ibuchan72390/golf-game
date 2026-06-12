import { meterValue } from './threeClick';

export const CHARGE_MS = 1200;
export const CONTACT_PERIOD_MS = 900;

export type HoldReleasePhase = 'idle' | 'charging' | 'contact' | 'done';
/** Shared prompt stage across swing schemes (HUD renders text per scheme). */
export type SwingStage = 'ready' | 'charging' | 'contact' | 'swinging';

/**
 * Hold & Release swing: press → power fills over CHARGE_MS (capped at 1);
 * release → locks power, contact bar sweeps (triangle wave); tap → contactError
 * is the signed offset from the bar center, in [-1, 1].
 */
export class HoldReleaseMeter {
  phase: HoldReleasePhase = 'idle';
  private pressMs = 0;
  private releaseMs = 0;
  private power = 0;
  private contactError = 0;

  press(nowMs: number): void {
    if (this.phase !== 'idle') return;
    this.phase = 'charging';
    this.pressMs = nowMs;
  }

  release(nowMs: number): void {
    if (this.phase !== 'charging') return;
    this.power = Math.min(1, (nowMs - this.pressMs) / CHARGE_MS);
    this.releaseMs = nowMs;
    this.phase = 'contact';
  }

  tap(nowMs: number): void {
    if (this.phase !== 'contact') return;
    const v = meterValue(nowMs - this.releaseMs, CONTACT_PERIOD_MS);
    this.contactError = Math.max(-1, Math.min(1, (v - 0.5) * 2));
    this.phase = 'done';
  }

  /** Active bar value for the HUD: power fill while charging, sweep while contact. */
  value(nowMs: number): number {
    if (this.phase === 'charging') return Math.min(1, (nowMs - this.pressMs) / CHARGE_MS);
    if (this.phase === 'contact') return meterValue(nowMs - this.releaseMs, CONTACT_PERIOD_MS);
    return 0;
  }

  powerValue(): number {
    return this.power;
  }

  stage(): SwingStage {
    if (this.phase === 'charging') return 'charging';
    if (this.phase === 'contact') return 'contact';
    if (this.phase === 'done') return 'swinging';
    return 'ready';
  }

  result(): { power: number; contactError: number } {
    return { power: this.power, contactError: this.contactError };
  }

  reset(): void {
    this.phase = 'idle';
  }
}
