// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { showFriends } from './friends';
import type { FriendsView } from '../net/friends';

// jsdom's selector engine resolves `#id` via getElementById (whole-document,
// first match), so leftover roots from prior tests would shadow our scoped
// lookups. Clear the body between tests to keep IDs unique.
afterEach(() => {
  document.body.innerHTML = '';
});

function root() {
  const r = document.createElement('div');
  document.body.appendChild(r);
  return r;
}

const view: FriendsView = {
  friends: [{ id: 'a', displayName: 'Alice' }],
  incoming: [{ id: 'c', displayName: 'Carol' }],
  outgoing: [],
};

function cbs() {
  return {
    onInvite: vi.fn(),
    onAccept: vi.fn(),
    onDecline: vi.fn(),
    onRemove: vi.fn(),
    onClose: vi.fn(),
  };
}

describe('showFriends', () => {
  it('renders friends and incoming requests', () => {
    const r = root();
    showFriends(r, view, null, cbs());
    expect(r.textContent).toContain('Alice');
    expect(r.textContent).toContain('Carol');
  });

  it('fires onInvite, onAccept, onRemove, onClose', () => {
    const r = root();
    const cb = cbs();
    showFriends(r, view, null, cb);
    (r.querySelector('#friends-invite') as HTMLElement).click();
    (r.querySelector('#friend-accept-c') as HTMLElement).click();
    (r.querySelector('#friend-remove-a') as HTMLElement).click();
    (r.querySelector('#friends-close') as HTMLElement).click();
    expect(cb.onInvite).toHaveBeenCalled();
    expect(cb.onAccept).toHaveBeenCalledWith('c');
    expect(cb.onRemove).toHaveBeenCalledWith('a');
    expect(cb.onClose).toHaveBeenCalled();
  });

  it('shows the invite link when provided', () => {
    const r = root();
    showFriends(r, view, 'https://app/?friend=xyz', cbs());
    const input = r.querySelector('#friends-invite-link') as HTMLInputElement;
    expect(input.value).toBe('https://app/?friend=xyz');
  });
});
