// src/net/friends.ts
export type FriendStatus = 'pending' | 'accepted';

export interface FriendshipRow {
  requesterId: string;
  addresseeId: string;
  status: FriendStatus;
}

export interface Friend {
  id: string;
  displayName: string;
}

export type FriendRequest = Friend; // the other party in a pending request

export interface FriendsView {
  friends: Friend[];
  incoming: FriendRequest[];
  outgoing: FriendRequest[];
}

/** Pure: fold raw friendship rows into a view model from `myId`'s perspective. */
export function friendsViewModel(
  rows: FriendshipRow[],
  myId: string,
  names: Map<string, string>,
): FriendsView {
  const friends = new Map<string, Friend>();
  const incoming = new Map<string, FriendRequest>();
  const outgoing = new Map<string, FriendRequest>();
  const resolve = (id: string): Friend => ({ id, displayName: names.get(id) ?? id });

  for (const row of rows) {
    if (row.requesterId !== myId && row.addresseeId !== myId) continue;
    const otherId = row.requesterId === myId ? row.addresseeId : row.requesterId;
    if (row.status === 'accepted') {
      friends.set(otherId, resolve(otherId));
    } else if (row.addresseeId === myId) {
      incoming.set(otherId, resolve(otherId));
    } else {
      outgoing.set(otherId, resolve(otherId));
    }
  }

  return {
    friends: [...friends.values()],
    incoming: [...incoming.values()],
    outgoing: [...outgoing.values()],
  };
}
