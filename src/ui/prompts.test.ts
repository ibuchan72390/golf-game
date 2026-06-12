// src/ui/prompts.test.ts
import { describe, expect, it } from 'vitest';
import { PROMPTS } from './prompts';

describe('PROMPTS', () => {
  it('covers every scheme × stage with non-empty text (except swinging)', () => {
    for (const scheme of ['holdRelease', 'threeClick'] as const) {
      for (const stage of ['ready', 'charging', 'contact'] as const) {
        expect(PROMPTS[scheme][stage].length).toBeGreaterThan(0);
      }
      expect(PROMPTS[scheme].swinging).toBe('');
    }
  });
});
