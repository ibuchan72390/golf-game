import { describe, expect, it } from 'vitest';
import { makeFakeStore, FakeMultiplayerService } from './fakeService';
import { friendsViewModel } from './friends';

describe('FakeMultiplayerService', () => {
  it('upserts profiles and resolves them', async () => {
    const store = makeFakeStore();
    const me = new FakeMultiplayerService(store, 'me');
    await me.upsertProfile('Me');
    expect(await me.getProfile('me')).toEqual({ id: 'me', displayName: 'Me' });
    expect(await me.getProfile('nobody')).toBeNull();
  });

  it('establishes a mutual friendship via an invite code', async () => {
    const store = makeFakeStore();
    const alice = new FakeMultiplayerService(store, 'alice');
    const bob = new FakeMultiplayerService(store, 'bob');
    await alice.upsertProfile('Alice');
    await bob.upsertProfile('Bob');

    const code = await alice.createFriendInvite();
    await bob.claimFriendInvite(code);

    const av = friendsViewModel(...(await asArgs(alice)));
    const bv = friendsViewModel(...(await asArgs(bob)));
    expect(av.friends.map((f) => f.id)).toEqual(['bob']);
    expect(bv.friends.map((f) => f.id)).toEqual(['alice']);
    expect(bv.friends[0]!.displayName).toBe('Alice');
  });

  it('claiming a code twice throws', async () => {
    const store = makeFakeStore();
    const alice = new FakeMultiplayerService(store, 'alice');
    const bob = new FakeMultiplayerService(store, 'bob');
    const code = await alice.createFriendInvite();
    await bob.claimFriendInvite(code);
    await expect(bob.claimFriendInvite(code)).rejects.toThrow();
  });

  it('removeFriend deletes the friendship for both sides', async () => {
    const store = makeFakeStore();
    const alice = new FakeMultiplayerService(store, 'alice');
    const bob = new FakeMultiplayerService(store, 'bob');
    const code = await alice.createFriendInvite();
    await bob.claimFriendInvite(code);
    await alice.removeFriend('bob');
    expect((await alice.listFriendships()).rows).toEqual([]);
    expect((await bob.listFriendships()).rows).toEqual([]);
  });
});

async function asArgs(svc: FakeMultiplayerService) {
  const { rows, names } = await svc.listFriendships();
  return [rows, svc.myUserId(), names] as const;
}
