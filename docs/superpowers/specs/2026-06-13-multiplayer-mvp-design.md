# Multiplayer MVP — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorm) — pending implementation plan
**Depends on:** shipped M1–M3 + mobile-playability pass (deterministic Three.js + Rapier sim, single-player Round/Game, Arcade HUD, local save profile).

## 1. Goal & scope

Add a **multiplayer MVP**: signed-in players become **friends**, then a host invites up to **3 friends** (4 total) into a **game room** with **live chat**, picks a course, and starts a **free-play** round where everyone plays the same holes at their own pace with a **live shared scorecard**.

This is the first slice of a larger vision. The MVP deliberately includes a *minimal* friend graph (because friendship gates sessions) but does **not** build the standalone, reusable, Dockerized, multi-app social service — that remains a later phase. The friend data is structured so it can later be extracted into that service.

### Decisions locked during brainstorm

- **MVP-first**, not the full social platform.
- **Supabase** (managed Postgres + Realtime + RLS) for all backend data. No servers we operate.
- **Provider-agnostic OIDC auth**, Auth0 as the concrete issuer, social login enabled. **Everyone authenticates** — no guest path.
- **Progression stays local** (localStorage). Cloud holds only identity + rooms + chat + scores. (Consequence: each player swings with their own local club bag; acceptable for casual play, a "standard bag" fairness option is deferred.)
- **Free-play** round model (not turn-based): each client is authoritative for its own ball and broadcasts stroke results; opponents render from shared progress.
- **Friendship is required** to be invited to / start a session.

## 2. Architecture & auth

**No servers we operate.** Static client stays on GitHub Pages. New infra is two managed services: **Supabase** (data/realtime/RLS) and **Auth0** (OIDC issuer). Both on free tiers.

**Provider-agnostic auth.** The app depends on an in-house interface, never on the Auth0 SDK:

```ts
interface AuthProvider {
  getUser(): { id: string; name: string } | null;  // id = OIDC `sub`
  login(): Promise<void>;
  logout(): Promise<void>;
  getAccessToken(): Promise<string | null>;
}
```

The concrete implementation runs a standard **OIDC authorization-code + PKCE** flow (generic lib, e.g. `oidc-client-ts`) configured purely by env: issuer URL, client ID, audience. Swapping Auth0 → Cognito/Keycloak/Clerk later is a config change plus that provider's social-login setup.

**Supabase trusts the issuer.** Supabase third-party-auth is pointed at the Auth0 issuer; it validates the OIDC JWT and RLS policies key off `auth.jwt()->>'sub'`. The Supabase client is configured with `accessToken: () => authProvider.getAccessToken()`, so every request carries the OIDC token. Provider-agnostic because Supabase just trusts an issuer URL + JWKS.

**Additive & graceful degradation.** Multiplayer is a layer *around* the existing Round/Game; the deterministic sim is untouched. **If Supabase/Auth0 env config is absent, the app runs exactly as today** (single-player), with "Play with Friends" hidden/disabled. A misconfigured deploy can never break solo play, and secret-less CI still builds and passes existing tests + the visual gate.

## 3. Data model, security & realtime

All tables in Supabase Postgres, RLS-protected, keyed off `auth.jwt()->>'sub'`.

- **`profiles`** — `id` (= OIDC sub, PK), `display_name`, `created_at`, `last_seen`. Identity only; no progression.
- **`friendships`** — `requester_id`, `addressee_id`, `status` (`pending` | `accepted`), `created_at`, `responded_at`; unique per unordered pair. A user's friends = `accepted` rows on either side. A **friend-invite link** carries a one-time code; the recipient opens it, logs in, and that establishes the friendship (inviter created the link + recipient clicked it = mutual consent, no extra approval step). In-app request/approve without a link is deferred to the full social service.
- **`rooms`** — `id` (uuid), `code` (short shareable), `host_id`, `status` (`lobby` | `in_progress` | `finished`), `course_seed` (int, set at start), `created_at`.
- **`room_members`** — `room_id`, `user_id`, `ready` (bool), `joined_at`; unique(room_id, user_id). Max 4. **Insert allowed only if the joiner is an accepted friend of the host** and room is in `lobby` with member count < 4 (enforced in the join RPC/policy).
- **`chat_messages`** — `id`, `room_id`, `user_id`, `body`, `created_at`.
- **`room_progress`** — `room_id`, `user_id`, `hole_index`, `strokes`, `ball_pos` (jsonb), `holed_out` (bool); one row per (room, user, hole). Drives the live shared scorecard and opponents' position markers. Written once per **completed stroke** (low frequency, DB-friendly).

**Row-level security (intent):** a user may read/write `rooms` / `room_members` / `chat_messages` / `room_progress` only for rooms they are a member of; `profiles` of users they share a room or friendship with; `friendships` rows where they are requester or addressee. Membership/friendship-gated writes are enforced via policies and, where multi-row checks are needed, server-side RPCs (Postgres functions).

**Realtime:** one Supabase Realtime channel per room — `postgres_changes` subscriptions on `chat_messages`, `room_members`, `room_progress`, and `rooms.status`; **presence** for who's currently connected. Incoming friend requests surface via a `postgres_changes` subscription on `friendships`.

**"Game already started":** the join path checks `rooms.status = 'lobby'` (and member count < 4); any other status returns a friendly rejection. Non-friends are rejected by the friendship gate.

## 4. Client flow & UI

New screens follow the existing Arcade DOM-overlay style. **Final visual polish defers to the redesign phase** (added to `redesign-notes.md`); this section is about flow and structure.

- **Entry & identity.** The menu gains **"Play with Friends,"** gated behind sign-in. First login runs the OIDC social flow, then prompts for a display name (defaulted from the OIDC profile) and upserts the `profiles` row.
- **Friends screen.** Lists friends (presence dot) and incoming requests (accept / decline). **"Invite a friend"** generates a shareable friend-invite link. Opening someone's friend-invite link → login → friends → land here.
- **Game room (lobby).** **"New Game"** creates a room and enters the lobby: member list (names, ready toggles, presence), **live chat**, and **"Invite friends"** (only friends selectable). Shows a shareable room code/link. The **host** picks the course (reusing existing course-select) and hits **Start** when members are ready. Late / non-friend joiners get a clear "game already started" / "you must be friends first" message.
- **Multiplayer round (free-play).** The existing Round/Game runs, plus colored **opponent ball markers**, a **live shared scorecard** overlay, and advance-to-next-hole when all players have holed out (host can force-advance an AFK player). Ends on a shared **leaderboard** summary.

**Clean seams (testability + sim isolation):**

- `AuthProvider` (OIDC) — §2.
- `RoomService` interface wrapping every Supabase call (`createRoom`, `joinRoom`, `listFriends`, `sendFriendInvite`, `acceptFriendInvite`, `sendChat`, `postProgress`, `subscribeRoom`, …). UI depends on the **interface**; a fake implementation drives tests and the unconfigured fallback.
- **Pure state logic** extracted and unit-tested: room-state reducer (members/chat/progress → view model), scorecard merge, and gate predicates (`canStart`, `alreadyStarted`, capacity, friendship check).
- The multiplayer round **wraps** the existing Round — each client stays authoritative for its own ball and broadcasts its stroke result via `postProgress`; opponents render from `room_progress`. The deterministic sim is reused as-is.

**Graceful degradation:** if Supabase/Auth0 env is absent, "Play with Friends" is hidden and single-player runs exactly as today.

## 5. Testing

- **Pure logic = bulk of coverage:** room-state reducer, scorecard merge, gate predicates — plain functions, Vitest, deterministic, no network.
- **Flow against fakes:** UI depends on `RoomService` / `AuthProvider` interfaces, so Playwright e2e drives friends / lobby / chat / multiplayer-round flows against a **fake** `RoomService` + fake auth (injected via a test hook). **CI needs zero Supabase/Auth0 secrets** and stays deterministic.
- **Untouched & green:** deterministic sim + all existing single-player tests + the visual gate are unaffected and require no secrets.
- **Not automatable in unit/e2e (stated plainly):** the *real* Supabase realtime/RLS path and live OIDC login are verified by the deployed-instance smoke suite (§7) plus a written manual checklist (incl. an RLS check that user A cannot read user B's room).
- **Visual snapshots of new screens are deferred to the redesign** — styling will change there, so baselining now is throwaway churn (noted in `redesign-notes.md`).

## 6. Config & secrets

- Only **public** config ships in the client: Supabase URL + **anon** key (RLS protects data) and Auth0 issuer / clientId / audience (public OIDC). **No service-role key, ever, in the client.**
- Delivered via Vite env vars (e.g. `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID`, `VITE_OIDC_AUDIENCE`); committed `.env.example`; real values injected from GitHub Actions secrets at build. If unset → multiplayer disabled (graceful degradation), so secret-less CI still builds and passes.
- DB schema + RLS policies live as **committed Supabase migration files** (`supabase/migrations/…`) so the database is reproducible/versioned; applied via the Supabase CLI.
- A short **setup doc** covers the Auth0 app (enable social login, callback URLs) and the Supabase third-party-auth configuration pointing at the Auth0 issuer.
- **Config is environment-aware** from the start: the same build can be pointed at a different Supabase project + Auth0 tenant purely by swapping env. Nothing hard-codes prod.

## 7. Deployment, smoke tests & QA path

**Hosting & cost:** client stays on GitHub Pages; Supabase + Auth0 on free tiers. **~$0** at this scale.

**Post-deploy smoke suite.** After the Pages deploy completes, CI runs a small Playwright suite **against the live deployed URL**, exercising the real happy path through **real Supabase + Auth0**: sign in → create room → invite a friend → chat → start → play a hole → see the shared scorecard. This proves both the build and the deployment flow, not just the mocked path. Adds a **post-deploy smoke-test job** to the CI/CD flow.

**Auth automation via a guarded token-injection seam.** Driving Auth0's login form headlessly is brittle. Instead, `AuthProvider` gains a **test-only path** that accepts a pre-obtained OIDC token, active **only** when an explicit test flag + token are present (never reachable in normal use). The smoke job obtains that token **non-interactively** from Auth0 (password / test-connection grant against seeded test users) and injects it — exercising the real Supabase/RLS path while skipping fragile form automation. **Two seeded test users** let us test the friendship + invite flow for real.

**Keep prod clean.** Smoke tests create **ephemeral, tagged** data (throwaway room/friendship between the two test users) and **tear it down** at the end. Test-user credentials / the grant client live in GitHub Actions secrets.

**QA-environment evolution (designed-for, not built now).** Because config is environment-aware and the smoke suite is environment-parameterized, "eventually" becomes: stand up a **second (free) Supabase project + Auth0 connection**, deploy a QA build of the client at them, run the smoke suite against QA, and promote to prod only when green. We do not build that pipeline now — we just ensure nothing hard-codes prod and the smoke suite is parameterized, so standing up QA later is config + a workflow, not a refactor. (QA Supabase + Auth0 stay on free tiers — still ~$0.)

## 8. Explicitly out of scope (later phases)

- The standalone, Dockerized, **reusable multi-app social service** with bans / permissions / custom multi-app schema. (The MVP friend graph is structured to be extractable into it.)
- **Out-of-app push notifications** ("your invite is waiting" while not in the app).
- **Cloud progression sync** / cross-device saves.
- **Turn-based / tournament mode** and a "standard bag" fairness option.
- **Cinematic replay** of opponents' shot trajectories (MVP shows position markers only).
- **Spectators** and advanced reconnection/resume robustness (basic rejoin-by-code only).
- **Visual polish** of the new screens (→ redesign phase).
