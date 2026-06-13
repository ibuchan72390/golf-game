import type { ClubId, ClubLevels, ClubLoadout, ClubStats, ShotIntent, Vec3 } from './types';

const DEG2RAD = Math.PI / 180;

export const CLUBS: Record<ClubId, ClubStats> = {
  driver:        { name: 'Driver',     maxSpeed: 70, launchDeg: 14, accuracy: 0.12, forgiveness: 0.15, spin: 0.1 },
  wood3:         { name: '3 Wood',     maxSpeed: 62, launchDeg: 16, accuracy: 0.11, forgiveness: 0.2,  spin: 0.15 },
  iron5:         { name: '5 Iron',     maxSpeed: 55, launchDeg: 20, accuracy: 0.09, forgiveness: 0.25, spin: 0.3 },
  iron7:         { name: '7 Iron',     maxSpeed: 50, launchDeg: 22, accuracy: 0.08, forgiveness: 0.3,  spin: 0.4 },
  iron9:         { name: '9 Iron',     maxSpeed: 44, launchDeg: 28, accuracy: 0.07, forgiveness: 0.35, spin: 0.5 },
  pitchingWedge: { name: 'Pitching W', maxSpeed: 36, launchDeg: 38, accuracy: 0.06, forgiveness: 0.4,  spin: 0.65 },
  sandWedge:     { name: 'Sand W',     maxSpeed: 30, launchDeg: 48, accuracy: 0.06, forgiveness: 0.4,  spin: 0.8 },
  putter:        { name: 'Putter',     maxSpeed: 12, launchDeg: 0,  accuracy: 0.02, forgiveness: 0.5,  spin: 0 },
};

const POWER_PER_LEVEL = 1.6;      // m/s
const ACCURACY_PER_LEVEL = 0.07;  // fractional tightening
const FORGIVE_PER_LEVEL = 0.05;
const SPIN_PER_LEVEL = 0.04;

export function effectiveStats(club: ClubId, levels: ClubLevels): ClubStats {
  const base = CLUBS[club];
  return {
    name: base.name,
    launchDeg: base.launchDeg,
    maxSpeed: base.maxSpeed + levels.power * POWER_PER_LEVEL,
    accuracy: base.accuracy * Math.max(0.3, 1 - levels.accuracy * ACCURACY_PER_LEVEL),
    forgiveness: Math.min(0.95, base.forgiveness + levels.forgiveness * FORGIVE_PER_LEVEL),
    spin: Math.min(0.95, base.spin + levels.spin * SPIN_PER_LEVEL),
  };
}

const ZERO: ClubLevels = { power: 0, accuracy: 0, forgiveness: 0, spin: 0 };
export const BASE_LOADOUT: ClubLoadout = Object.fromEntries(
  (Object.keys(CLUBS) as ClubId[]).map((id) => [id, effectiveStats(id, ZERO)]),
) as ClubLoadout;

/**
 * Initial ball velocity for a shot. `wobble` (0..1, from the seeded RNG)
 * scales how much of the club's max dispersion this contactError costs.
 */
export function launchVelocity(club: ClubStats, intent: ShotIntent, wobble: number): Vec3 {
  const ce = intent.contactError * (1 - club.forgiveness); // forgiveness softens mishits
  const speed = club.maxSpeed * intent.power;
  const yaw = intent.aimDir + ce * club.accuracy * (0.5 + 0.5 * wobble);
  const pitch = club.launchDeg * DEG2RAD * (1 - 0.2 * Math.abs(ce));
  return {
    x: speed * Math.cos(pitch) * Math.sin(yaw),
    y: speed * Math.sin(pitch),
    z: -speed * Math.cos(pitch) * Math.cos(yaw),
  };
}
