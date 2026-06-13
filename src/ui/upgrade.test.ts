// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { showUpgradeScreen } from './upgrade';
import { DEFAULT_PROFILE } from '../save/profile';

describe('upgrade screen', () => {
  it('shows the SP balance, club list, and fires buy with the selected club+stat', () => {
    const root = document.createElement('div');
    const onBuy = vi.fn();
    const onClose = vi.fn();
    const profile = { ...DEFAULT_PROFILE, skillPoints: 50 };
    showUpgradeScreen(root, profile, { onBuy, onClose });
    expect(root.textContent).toContain('50'); // SP balance
    // select 7 iron, then buy Power
    (root.querySelector('#club-iron7') as HTMLElement).click();
    (root.querySelector('#buy-power') as HTMLElement).click();
    expect(onBuy).toHaveBeenCalledWith('iron7', 'power');
    (root.querySelector('#upgrade-close') as HTMLElement).click();
    expect(onClose).toHaveBeenCalled();
  });
});
