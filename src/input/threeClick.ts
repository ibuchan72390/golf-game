import type { SwingStage } from './holdRelease';

export const METER_PERIOD_MS = 1600;
export const ACCURACY_TARGET = 0.1;

export type MeterPhase = 'idle' | 'power' | 'accuracy' | 'done';

/** Triangle wave 0 → 1 → 0 across one period. Pure function of time. */
export function meterValue(elapsedMs: number, periodMs = METER_PERIOD_MS): number {
  const phase = ((elapsedMs % periodMs) + periodMs) % periodMs / periodMs;
  return phase < 0.5 ? phase * 2 : (1 - phase) * 2;
}

/**
 * Classic 3-click swing: begin() starts the meter, first click() locks power,
 * second click() measures contact error vs ACCURACY_TARGET.
 */
export class ThreeClickMeter {
  phase: MeterPhase = 'idle';
  private startMs = 0;
  private power = 0;
  private contactError = 0;

  begin(nowMs: number): void {
    this.phase = 'power';
    this.startMs = nowMs;
  }

  value(nowMs: number): number {
    return this.phase === 'power' || this.phase === 'accuracy' ? meterValue(nowMs - this.startMs) : 0;
  }

  click(nowMs: number): void {
    if (this.phase === 'power') {
      this.power = meterValue(nowMs - this.startMs);
      this.phase = 'accuracy';
    } else if (this.phase === 'accuracy') {
      const v = meterValue(nowMs - this.startMs);
      this.contactError = Math.max(-1, Math.min(1, (v - ACCURACY_TARGET) / (1 - ACCURACY_TARGET)));
      this.phase = 'done';
    }
  }

  result(): { power: number; contactError: number } {
    return { power: this.power, contactError: this.contactError };
  }

  stage(): SwingStage {
    if (this.phase === 'power') return 'charging';
    if (this.phase === 'accuracy') return 'contact';
    if (this.phase === 'done') return 'swinging';
    return 'ready';
  }

  reset(): void {
    this.phase = 'idle';
  }
}
