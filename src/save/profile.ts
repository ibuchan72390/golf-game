import type { ClubId, ClubLevelMap, ClubLevels } from '../sim/types';

export type InputScheme = 'holdRelease' | 'threeClick';

export interface Profile {
  version: 2;
  settings: { inputScheme: InputScheme };
  skillPoints: number;
  clubLevels: ClubLevelMap;
  bestScores: Record<string, number>;
}

const CLUB_IDS: ClubId[] = ['driver', 'wood3', 'iron5', 'iron7', 'iron9', 'pitchingWedge', 'sandWedge', 'putter'];
const ZERO: ClubLevels = { power: 0, accuracy: 0, forgiveness: 0, spin: 0 };

function zeroLevels(): ClubLevelMap {
  return Object.fromEntries(CLUB_IDS.map((id) => [id, { ...ZERO }])) as ClubLevelMap;
}

export const DEFAULT_PROFILE: Profile = {
  version: 2,
  settings: { inputScheme: 'holdRelease' },
  skillPoints: 0,
  clubLevels: zeroLevels(),
  bestScores: {},
};

const KEY = 'golf-profile';
type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadProfile(storage: StorageLike): Profile {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const parsed = JSON.parse(raw) as { version?: number; settings?: { inputScheme?: string }; skillPoints?: number; clubLevels?: ClubLevelMap; bestScores?: Record<string, number> };
    const scheme = parsed.settings?.inputScheme === 'threeClick' ? 'threeClick' : 'holdRelease';
    if (parsed.version === 2 && parsed.clubLevels && typeof parsed.skillPoints === 'number') {
      // trust a well-formed v2, but backfill any missing club entries
      const clubLevels = zeroLevels();
      for (const id of CLUB_IDS) {
        const lv = (parsed.clubLevels as ClubLevelMap)[id];
        if (lv) clubLevels[id] = { power: lv.power | 0, accuracy: lv.accuracy | 0, forgiveness: lv.forgiveness | 0, spin: lv.spin | 0 };
      }
      return { version: 2, settings: { inputScheme: scheme }, skillPoints: parsed.skillPoints, clubLevels, bestScores: parsed.bestScores ?? {} };
    }
    if (parsed.version === 1) {
      return { ...structuredClone(DEFAULT_PROFILE), settings: { inputScheme: scheme } };
    }
    return structuredClone(DEFAULT_PROFILE);
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(storage: StorageLike, profile: Profile): void {
  storage.setItem(KEY, JSON.stringify(profile));
}
