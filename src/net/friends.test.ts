import { describe, expect, it } from 'vitest';
import { friendsViewModel, type FriendshipRow } from './friends';

const names = new Map([
  ['me', 'Me'],
  ['a', 'Alice'],
  ['b', 'Bob'],
  ['c', 'Carol'],
]);

describe('friendsViewModel', () => {
  it('lists accepted friendships in either direction as friends', () => {
    const rows: FriendshipRow[] = [
      { requesterId: 'me', addresseeId: 'a', status: 'accepted' },
      { requesterId: 'b', addresseeId: 'me', status: 'accepted' },
    ];
    const v = friendsViewModel(rows, 'me', names);
    expect(v.friends.map((f) => f.id).sort()).toEqual(['a', 'b']);
    expect(v.friends.find((f) => f.id === 'a')!.displayName).toBe('Alice');
  });

  it('splits pending into incoming (to me) and outgoing (from me)', () => {
    const rows: FriendshipRow[] = [
      { requesterId: 'c', addresseeId: 'me', status: 'pending' }, // incoming
      { requesterId: 'me', addresseeId: 'a', status: 'pending' }, // outgoing
    ];
    const v = friendsViewModel(rows, 'me', names);
    expect(v.incoming.map((r) => r.id)).toEqual(['c']);
    expect(v.outgoing.map((r) => r.id)).toEqual(['a']);
    expect(v.friends).toEqual([]);
  });

  it('falls back to the id when no display name is known', () => {
    const rows: FriendshipRow[] = [{ requesterId: 'me', addresseeId: 'z', status: 'accepted' }];
    const v = friendsViewModel(rows, 'me', new Map());
    expect(v.friends[0]).toEqual({ id: 'z', displayName: 'z' });
  });

  it('dedupes a friend that appears in multiple rows', () => {
    const rows: FriendshipRow[] = [
      { requesterId: 'me', addresseeId: 'a', status: 'accepted' },
      { requesterId: 'a', addresseeId: 'me', status: 'accepted' },
    ];
    const v = friendsViewModel(rows, 'me', names);
    expect(v.friends.map((f) => f.id)).toEqual(['a']);
  });
});
