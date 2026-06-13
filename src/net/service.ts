// src/net/service.ts
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FriendshipRow } from './friends';

export interface ProfileRef {
  id: string;
  displayName: string;
}

export interface MultiplayerService {
  myUserId(): string;
  getProfile(id: string): Promise<ProfileRef | null>;
  upsertProfile(displayName: string): Promise<void>;
  /** All friendship rows touching me, plus a name map for the involved users. */
  listFriendships(): Promise<{ rows: FriendshipRow[]; names: Map<string, string> }>;
  /** Create a one-time invite code for a shareable friend link. */
  createFriendInvite(): Promise<string>;
  /** Redeem an invite code → establishes an accepted friendship. */
  claimFriendInvite(code: string): Promise<void>;
  acceptRequest(otherId: string): Promise<void>;
  declineRequest(otherId: string): Promise<void>;
  removeFriend(otherId: string): Promise<void>;
  /** Subscribe to friendship changes; returns an unsubscribe fn. */
  subscribeFriends(onChange: () => void): () => void;
}

interface FriendshipDbRow { requester_id: string; addressee_id: string; status: 'pending' | 'accepted' }
interface ProfileDbRow { id: string; display_name: string }

export class SupabaseMultiplayerService implements MultiplayerService {
  constructor(
    private db: SupabaseClient,
    private userId: string,
  ) {}

  myUserId(): string { return this.userId; }

  async getProfile(id: string): Promise<ProfileRef | null> {
    const { data, error } = await this.db.from('profiles').select('id, display_name').eq('id', id).maybeSingle();
    if (error) throw error;
    return data ? { id: data.id, displayName: data.display_name } : null;
  }

  async upsertProfile(displayName: string): Promise<void> {
    const { error } = await this.db
      .from('profiles')
      .upsert({ id: this.userId, display_name: displayName }, { onConflict: 'id' });
    if (error) throw error;
  }

  async listFriendships(): Promise<{ rows: FriendshipRow[]; names: Map<string, string> }> {
    const { data, error } = await this.db
      .from('friendships')
      .select('requester_id, addressee_id, status')
      .or(`requester_id.eq.${this.userId},addressee_id.eq.${this.userId}`);
    if (error) throw error;
    const dbRows = (data ?? []) as FriendshipDbRow[];
    const rows: FriendshipRow[] = dbRows.map((r) => ({
      requesterId: r.requester_id,
      addresseeId: r.addressee_id,
      status: r.status,
    }));
    const otherIds = [...new Set(rows.map((r) => (r.requesterId === this.userId ? r.addresseeId : r.requesterId)))];
    const names = new Map<string, string>();
    if (otherIds.length) {
      const { data: profs, error: pErr } = await this.db
        .from('profiles')
        .select('id, display_name')
        .in('id', otherIds);
      if (pErr) throw pErr;
      for (const p of (profs ?? []) as ProfileDbRow[]) names.set(p.id, p.display_name);
    }
    return { rows, names };
  }

  async createFriendInvite(): Promise<string> {
    const { data, error } = await this.db.rpc('create_friend_invite');
    if (error) throw error;
    return data as string;
  }

  async claimFriendInvite(code: string): Promise<void> {
    const { error } = await this.db.rpc('claim_friend_invite', { invite_code: code });
    if (error) throw error;
  }

  async acceptRequest(otherId: string): Promise<void> {
    const { error } = await this.db
      .from('friendships')
      .update({ status: 'accepted', responded_at: new Date().toISOString() })
      .eq('requester_id', otherId)
      .eq('addressee_id', this.userId);
    if (error) throw error;
  }

  async declineRequest(otherId: string): Promise<void> {
    const { error } = await this.db
      .from('friendships')
      .delete()
      .eq('requester_id', otherId)
      .eq('addressee_id', this.userId);
    if (error) throw error;
  }

  async removeFriend(otherId: string): Promise<void> {
    const { error } = await this.db
      .from('friendships')
      .delete()
      .or(
        `and(requester_id.eq.${this.userId},addressee_id.eq.${otherId}),` +
          `and(requester_id.eq.${otherId},addressee_id.eq.${this.userId})`,
      );
    if (error) throw error;
  }

  subscribeFriends(onChange: () => void): () => void {
    const channel = this.db
      .channel(`friendships:${this.userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'friendships' }, () => onChange())
      .subscribe();
    return () => { void this.db.removeChannel(channel); };
  }
}
