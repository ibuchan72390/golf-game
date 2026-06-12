// src/ui/prompts.ts
import type { SwingStage } from '../input/holdRelease';
import type { InputScheme } from '../save/profile';

export const PROMPTS: Record<InputScheme, Record<SwingStage, string>> = {
  holdRelease: {
    ready: 'HOLD TO CHARGE',
    charging: 'RELEASE TO SET POWER',
    contact: 'TAP THE GREEN BAND',
    swinging: '',
  },
  threeClick: {
    ready: 'CLICK TO START YOUR SWING',
    charging: 'CLICK AT MAX POWER',
    contact: 'CLICK ON THE MARKER',
    swinging: '',
  },
};
