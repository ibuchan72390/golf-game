-- supabase/migrations/0001_profiles_friendships.sql
-- Identity + friend graph for the multiplayer MVP. RLS keyed off the OIDC `sub`
-- delivered by third-party auth: auth.jwt()->>'sub'.

-- gen_random_bytes() lives in pgcrypto (Supabase installs it in the `extensions`
-- schema). Ensure it exists so the invite RPC resolves on a fresh project.
create extension if not exists pgcrypto with schema extensions;

create or replace function public.current_uid() returns text
  language sql stable as $$ select auth.jwt()->>'sub' $$;

-- Profiles -----------------------------------------------------------------
create table if not exists public.profiles (
  id           text primary key,
  display_name text not null check (length(display_name) between 1 and 40),
  created_at   timestamptz not null default now(),
  last_seen    timestamptz not null default now()
);
alter table public.profiles enable row level security;

create policy profiles_select_authenticated on public.profiles
  for select using (public.current_uid() is not null);
create policy profiles_upsert_self on public.profiles
  for insert with check (id = public.current_uid());
create policy profiles_update_self on public.profiles
  for update using (id = public.current_uid()) with check (id = public.current_uid());

-- Friendships --------------------------------------------------------------
create table if not exists public.friendships (
  requester_id text not null references public.profiles(id) on delete cascade,
  addressee_id text not null references public.profiles(id) on delete cascade,
  status       text not null default 'accepted' check (status in ('pending','accepted')),
  created_at   timestamptz not null default now(),
  responded_at timestamptz,
  primary key (requester_id, addressee_id),
  check (requester_id <> addressee_id)
);
alter table public.friendships enable row level security;

create policy friendships_select_mine on public.friendships
  for select using (
    requester_id = public.current_uid() or addressee_id = public.current_uid()
  );
-- Accept (update) only the addressee may flip a pending row.
create policy friendships_update_addressee on public.friendships
  for update using (addressee_id = public.current_uid());
-- Delete (remove friend / decline) either party may.
create policy friendships_delete_mine on public.friendships
  for delete using (
    requester_id = public.current_uid() or addressee_id = public.current_uid()
  );
-- No direct INSERT policy: friendships are created only via claim_friend_invite().

-- Friend invites -----------------------------------------------------------
create table if not exists public.friend_invites (
  code        text primary key,
  inviter_id  text not null references public.profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  claimed_by  text references public.profiles(id),
  claimed_at  timestamptz
);
alter table public.friend_invites enable row level security;
-- Inviter can see their own invites; claim happens via SECURITY DEFINER rpc.
create policy friend_invites_select_own on public.friend_invites
  for select using (inviter_id = public.current_uid());

-- RPC: create a one-time invite code for the caller.
create or replace function public.create_friend_invite() returns text
  language plpgsql security definer set search_path = public, extensions as $$
declare
  uid text := public.current_uid();
  new_code text;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  new_code := encode(gen_random_bytes(9), 'base64');
  new_code := replace(replace(replace(new_code, '+', '-'), '/', '_'), '=', '');
  insert into public.friend_invites(code, inviter_id) values (new_code, uid);
  return new_code;
end $$;

-- RPC: claim an invite → establishes an accepted friendship.
create or replace function public.claim_friend_invite(invite_code text) returns void
  language plpgsql security definer set search_path = public as $$
declare
  uid text := public.current_uid();
  inv public.friend_invites%rowtype;
begin
  if uid is null then raise exception 'not authenticated'; end if;
  select * into inv from public.friend_invites where code = invite_code for update;
  if not found then raise exception 'invalid invite'; end if;
  if inv.claimed_by is not null then raise exception 'invite already claimed'; end if;
  if inv.inviter_id = uid then raise exception 'cannot friend yourself'; end if;

  update public.friend_invites
    set claimed_by = uid, claimed_at = now() where code = invite_code;

  insert into public.friendships(requester_id, addressee_id, status, responded_at)
    values (inv.inviter_id, uid, 'accepted', now())
    on conflict (requester_id, addressee_id) do nothing;
end $$;

grant execute on function public.create_friend_invite() to authenticated, anon;
grant execute on function public.claim_friend_invite(text) to authenticated, anon;
