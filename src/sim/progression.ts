import { effectiveStats } from './clubs';
import type { ClubId, ClubLoadout, ClubLevels } from './types';
import type { Profile } from '../save/profile';

// ── Tunable economy block (generous "B" default) ──────────────────────────
const AWARD_BASE = 30;          // baseline points for finishing a round
const DIFFICULTY_BONUS = 1.0;   // ×(1 + DIFFICULTY_BONUS·difficulty)
const SCORE_SLOPE = 0.08;       // each stroke under par adds, over par removes
const SCORE_FLOOR = 0.4;        // score multiplier never below this
const UPGRADE_BASE_COST = 2;    // cost of the first level
const UPGRADE_COST_SLOPE = 2;   // +slope per existing level
export const MAX_STAT_LEVEL = 10;
// ──────────────────────────────────────────────────────────────────────────

/** Points for a completed round. `difficulty` 0..1 avg; `relativeToPar` total strokes − par. */
export function awardPoints(difficulty: number, relativeToPar: number): number {
  const scoreMul = Math.max(SCORE_FLOOR, 1.5 - relativeToPar * SCORE_SLOPE);
  return Math.round(AWARD_BASE * (1 + DIFFICULTY_BONUS * difficulty) * scoreMul);
}

export function upgradeCost(currentLevel: number): number {
  return UPGRADE_BASE_COST + currentLevel * UPGRADE_COST_SLOPE;
}

export type StatKey = keyof ClubLevels;

/** Returns a new profile with the upgrade applied, or null if unaffordable / capped. */
export function buyUpgrade(profile: Profile, club: ClubId, stat: StatKey): Profile | null {
  const cur = profile.clubLevels[club][stat];
  if (cur >= MAX_STAT_LEVEL) return null;
  const cost = upgradeCost(cur);
  if (profile.skillPoints < cost) return null;
  return {
    ...profile,
    skillPoints: profile.skillPoints - cost,
    clubLevels: {
      ...profile.clubLevels,
      [club]: { ...profile.clubLevels[club], [stat]: cur + 1 },
    },
  };
}

export function loadoutFromProfile(profile: Profile): ClubLoadout {
  const ids = Object.keys(profile.clubLevels) as ClubId[];
  return Object.fromEntries(ids.map((id) => [id, effectiveStats(id, profile.clubLevels[id])])) as ClubLoadout;
}
