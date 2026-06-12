export type InputScheme = 'holdRelease' | 'threeClick';

export interface Profile {
  version: 1;
  settings: { inputScheme: InputScheme };
}

export const DEFAULT_PROFILE: Profile = {
  version: 1,
  settings: { inputScheme: 'holdRelease' },
};

const KEY = 'golf-profile';

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function loadProfile(storage: StorageLike): Profile {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULT_PROFILE);
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' && parsed !== null &&
      (parsed as Profile).version === 1 &&
      ((parsed as Profile).settings?.inputScheme === 'holdRelease' ||
        (parsed as Profile).settings?.inputScheme === 'threeClick')
    ) {
      return parsed as Profile;
    }
    return structuredClone(DEFAULT_PROFILE);
  } catch {
    return structuredClone(DEFAULT_PROFILE);
  }
}

export function saveProfile(storage: StorageLike, profile: Profile): void {
  storage.setItem(KEY, JSON.stringify(profile));
}
