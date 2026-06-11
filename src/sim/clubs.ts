import type { ClubId, ClubStats, ShotIntent, Vec3 } from './types';

const DEG2RAD = Math.PI / 180;

export const CLUBS: Record<ClubId, ClubStats> = {
  driver: { name: 'Driver', maxSpeed: 70, launchDeg: 14, accuracy: 0.12 },
  iron7: { name: '7 Iron', maxSpeed: 50, launchDeg: 22, accuracy: 0.08 },
  wedge: { name: 'Wedge', maxSpeed: 30, launchDeg: 45, accuracy: 0.06 },
  putter: { name: 'Putter', maxSpeed: 12, launchDeg: 0, accuracy: 0.02 },
};

/**
 * Initial ball velocity for a shot. `wobble` (0..1, from the seeded RNG)
 * scales how much of the club's max dispersion this contactError costs.
 */
export function launchVelocity(club: ClubStats, intent: ShotIntent, wobble: number): Vec3 {
  const speed = club.maxSpeed * intent.power;
  const yaw = intent.aimDir + intent.contactError * club.accuracy * (0.5 + 0.5 * wobble);
  const pitch = club.launchDeg * DEG2RAD * (1 - 0.2 * Math.abs(intent.contactError));
  return {
    x: speed * Math.cos(pitch) * Math.sin(yaw),
    y: speed * Math.sin(pitch),
    z: -speed * Math.cos(pitch) * Math.cos(yaw),
  };
}
