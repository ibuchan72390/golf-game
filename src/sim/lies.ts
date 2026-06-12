// src/sim/lies.ts
import { SURFACE, type Surface } from '../course/format';
import type { ClubId } from './types';

export interface StrikeModifier {
  powerMul: number;
  errorMul: number;
}

/** Lie penalty at strike. `roll` is a seeded RNG draw in [0,1). */
export function strikeModifier(lie: Surface, club: ClubId, roll: number): StrikeModifier {
  if (lie === SURFACE.rough) return { powerMul: 0.8 - 0.15 * roll, errorMul: 1.6 };
  if (lie === SURFACE.sand) {
    return club === 'wedge'
      ? { powerMul: 0.85, errorMul: 1.2 }
      : { powerMul: 0.45, errorMul: 2.5 };
  }
  return { powerMul: 1, errorMul: 1 };
}
