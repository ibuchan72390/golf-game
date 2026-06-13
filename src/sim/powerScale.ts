// src/sim/powerScale.ts
import { CLUBS } from './clubs';
import { SURFACE, type Surface } from '../course/format';
import type { ClubId } from './types';

/** Measured effective putt deceleration on green physics (Task 5 review): roll ≈ v0 / PUTT_DECEL. */
export const PUTT_DECEL = 1.1;
const PUTT_MARGIN = 1.15; // full bar carries ~15% past the pin — skill lives below full
const CHIP_RANGE_M = 40;

/**
 * The speed a FULL meter bar maps to for the current shot. The meter's 0..1
 * power output is multiplied by (meterMaxSpeed / club.maxSpeed) by the Game,
 * so the sim itself stays untouched.
 */
export function meterMaxSpeed(club: ClubId, lie: Surface, distToPin: number): number {
  if (club === 'putter') {
    return Math.min(CLUBS.putter.maxSpeed, Math.max(2, PUTT_DECEL * distToPin * PUTT_MARGIN));
  }
  if ((club === 'sandWedge' || club === 'pitchingWedge') && lie !== SURFACE.green && distToPin < CHIP_RANGE_M) {
    return Math.min(CLUBS[club].maxSpeed, Math.sqrt(9.81 * Math.max(distToPin, 5)) * 1.2);
  }
  return CLUBS[club].maxSpeed;
}
