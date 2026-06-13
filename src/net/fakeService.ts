// src/net/fakeService.ts
import type { FriendshipRow } from './friends';
import type { MultiplayerService, ProfileRef } from './service';

export interface FakeStore {
  profiles: Map<string, string>; // id -> displayName
  friendships: FriendshipRow[];
  invites: Map<string, { inviter: string; claimed: boolean }>;
  listeners: Set<() => void>;
  seq: number;
}

export function makeFakeStore(): FakeStore {
  return {
    profiles: new Map(),
    friendships: [],
    invites: new Map(),
    listeners: new Set(),
    seq: 0,
  };
}

function notify(store: FakeStore): void {
  for (const l of store.listeners) l();
}

export class FakeMultiplayerService implements MultiplayerService {
  constructor(private store: FakeStore, private userId: string) {}

  myUserId(): string { return this.userId; }

  async getProfile(id: string): Promise<ProfileRef | null> {
    const name = this.store.profiles.get(id);
    return name === undefined ? null : { id, displayName: name };
  }

  async upsertProfile(displayName: string): Promise<void> {
    this.store.profiles.set(this.userId, displayName);
  }

  async listFriendships(): Promise<{ rows: FriendshipRow[]; names: Map<string, string> }> {
    const rows = this.store.friendships.filter(
      (r) => r.requesterId === this.userId || r.addresseeId === this.userId,
    );
    const names = new Map<string, string>();
    for (const r of rows) {
      const other = r.requesterId === this.userId ? r.addresseeId : r.requesterId;
      const n = this.store.profiles.get(other);
      if (n !== undefined) names.set(other, n);
    }
    return { rows: rows.map((r) => ({ ...r })), names };
  }

  async createFriendInvite(): Promise<string> {
    const code = `invite-${this.userId}-${this.store.seq++}`;
    this.store.invites.set(code, { inviter: this.userId, claimed: false });
    return code;
  }

  async claimFriendInvite(code: string): Promise<void> {
    const invite = this.store.invites.get(code);
    if (!invite || invite.claimed) throw new Error('invalid or already-claimed invite');
    if (invite.inviter === this.userId) throw new Error('cannot friend yourself');
    invite.claimed = true;
    const exists = this.store.friendships.some(
      (r) =>
        (r.requesterId === invite.inviter && r.addresseeId === this.userId) ||
        (r.requesterId === this.userId && r.addresseeId === invite.inviter),
    );
    if (!exists) {
      this.store.friendships.push({ requesterId: invite.inviter, addresseeId: this.userId, status: 'accepted' });
    }
    notify(this.store);
  }

  async acceptRequest(otherId: string): Promise<void> {
    const row = this.store.friendships.find(
      (r) => r.requesterId === otherId && r.addresseeId === this.userId && r.status === 'pending',
    );
    if (row) row.status = 'accepted';
    notify(this.store);
  }

  async declineRequest(otherId: string): Promise<void> {
    this.store.friendships = this.store.friendships.filter(
      (r) => !(r.requesterId === otherId && r.addresseeId === this.userId && r.status === 'pending'),
    );
    notify(this.store);
  }

  async removeFriend(otherId: string): Promise<void> {
    this.store.friendships = this.store.friendships.filter(
      (r) =>
        !(
          (r.requesterId === this.userId && r.addresseeId === otherId) ||
          (r.requesterId === otherId && r.addresseeId === this.userId)
        ),
    );
    notify(this.store);
  }

  subscribeFriends(onChange: () => void): () => void {
    this.store.listeners.add(onChange);
    return () => { this.store.listeners.delete(onChange); };
  }
}
