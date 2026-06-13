// src/ui/friends.ts
import type { FriendsView } from '../net/friends';

const overlay =
  'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:flex-start;gap:14px;padding:32px 16px;overflow:auto;background:linear-gradient(180deg,#6fc3f0,#cdeefb);pointer-events:auto;font-family:system-ui,sans-serif;';
const btn =
  'background:#1b5e20;color:#fff;border:none;border-radius:12px;padding:10px 18px;font-size:15px;font-weight:700;cursor:pointer;';
const row =
  'display:flex;align-items:center;justify-content:space-between;gap:12px;width:min(92vw,460px);background:rgba(255,255,255,.7);border-radius:10px;padding:10px 14px;';

export interface FriendsCallbacks {
  onInvite(): void;
  onAccept(id: string): void;
  onDecline(id: string): void;
  onRemove(id: string): void;
  onClose(): void;
}

export function showFriends(
  root: HTMLElement,
  view: FriendsView,
  inviteLink: string | null,
  cb: FriendsCallbacks,
): void {
  const esc = (s: string) =>
    s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

  const friendRows = view.friends.length
    ? view.friends
        .map(
          (f) =>
            `<div style="${row}"><span>👤 ${esc(f.displayName)}</span>` +
            `<button id="friend-remove-${f.id}" style="${btn}background:#b71c1c;padding:6px 12px;font-size:13px;">Remove</button></div>`,
        )
        .join('')
    : `<div style="opacity:.7;">No friends yet — send an invite link.</div>`;

  const incomingRows = view.incoming
    .map(
      (r) =>
        `<div style="${row}"><span>📩 ${esc(r.displayName)}</span><span>` +
        `<button id="friend-accept-${r.id}" style="${btn}padding:6px 12px;font-size:13px;">Accept</button> ` +
        `<button id="friend-decline-${r.id}" style="${btn}background:#607d8b;padding:6px 12px;font-size:13px;">Decline</button></span></div>`,
    )
    .join('');

  const linkBlock = inviteLink
    ? `<div style="${row}"><input id="friends-invite-link" readonly value="${esc(inviteLink)}" style="flex:1;border:none;background:transparent;font-size:13px;" />` +
      `<button id="friends-copy" style="${btn}padding:6px 12px;font-size:13px;">Copy</button></div>`
    : '';

  root.innerHTML = `
    <div style="${overlay}">
      <div style="font-size:30px;font-weight:900;color:#1b5e20;">Friends</div>
      <button id="friends-invite" style="${btn}background:#ef6c00;">➕ Invite a Friend</button>
      ${linkBlock}
      ${view.incoming.length ? `<div style="font-weight:800;color:#37474f;">Requests</div>${incomingRows}` : ''}
      <div style="font-weight:800;color:#37474f;margin-top:6px;">Your Friends</div>
      ${friendRows}
      <button id="friends-close" style="${btn}background:#37474f;margin-top:12px;">Back</button>
    </div>`;

  (root.querySelector('#friends-invite') as HTMLElement).onclick = cb.onInvite;
  (root.querySelector('#friends-close') as HTMLElement).onclick = cb.onClose;
  const copy = root.querySelector('#friends-copy') as HTMLElement | null;
  if (copy && inviteLink) copy.onclick = () => void navigator.clipboard?.writeText(inviteLink);
  for (const f of view.friends) {
    (root.querySelector(`#friend-remove-${f.id}`) as HTMLElement).onclick = () => cb.onRemove(f.id);
  }
  for (const r of view.incoming) {
    (root.querySelector(`#friend-accept-${r.id}`) as HTMLElement).onclick = () => cb.onAccept(r.id);
    (root.querySelector(`#friend-decline-${r.id}`) as HTMLElement).onclick = () => cb.onDecline(r.id);
  }
}
