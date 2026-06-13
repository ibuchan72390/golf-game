# Multiplayer Setup (Phase 1: Identity & Friends)

Multiplayer is **disabled** unless all required env vars are set. Single-player
needs no setup and CI passes without secrets.

## Provisioning the backend

Two paths:

- **Terraform (recommended, reproducible):** `terraform/` provisions the Supabase
  project, Auth0 app, schema, and GitHub `VITE_*` secrets for `prod` (and `qa`)
  from one reusable module. See [`terraform/README.md`](../terraform/README.md)
  for the one-time bootstrap + `terraform apply`. After `apply`, just trigger a
  deploy.
- **Manual (below):** create the Supabase + Auth0 projects by hand and
  `gh secret set` the values. Use this only if you're not using Terraform.

## Required env (`.env`, or GitHub Actions secrets at build time)

| Var | Source |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project → Settings → API |
| `VITE_SUPABASE_ANON_KEY` | Supabase project → Settings → API (anon/public key) |
| `VITE_OIDC_ISSUER` | Auth0 → Application → Domain (e.g. `https://TENANT.us.auth0.com/`) |
| `VITE_OIDC_CLIENT_ID` | Auth0 → Application → Client ID |
| `VITE_OIDC_AUDIENCE` (optional) | Auth0 API identifier, if using an API audience |
| `VITE_OIDC_REDIRECT_URI` (optional) | Defaults to the app's origin+path |

> **These are public client config, not secrets.** Vite inlines `VITE_*` into the
> shipped bundle; the Supabase **anon** key + OIDC public config are designed to be
> public (RLS + JWT validation enforce access). **Never** add the Supabase
> **service-role** key here — it bypasses RLS and would leak in the bundle.

## How the values reach a build

- **Production (GitHub Pages):** the deploy job's build step injects them from
  GitHub Actions secrets (already wired in `.github/workflows/ci.yml`). Seed them:
  ```bash
  gh secret set VITE_SUPABASE_URL
  gh secret set VITE_SUPABASE_ANON_KEY
  gh secret set VITE_OIDC_ISSUER
  gh secret set VITE_OIDC_CLIENT_ID
  gh secret set VITE_OIDC_AUDIENCE        # optional
  gh secret set VITE_OIDC_REDIRECT_URI    # optional
  ```
  (each prompts for the value; or use Settings → Secrets and variables → Actions).
  Then trigger a deploy (push to `main` or re-run the workflow). Until they exist,
  the secrets resolve to empty strings and multiplayer stays dormant.
- **Local dev (real backend):** put the same `VITE_*` in a `.env` file (gitignored;
  copy `.env.example`) and `npm run dev`. For UI work with no backend at all, use
  `npm run dev` and open `/?mp=fake&user=you` (in-memory fake, no setup).

## Auth0
1. Create a **Single Page Application**.
2. Allowed Callback/Logout/Web-Origins URLs: your dev (`http://localhost:5173`) and prod (`https://<user>.github.io/golf-game/`) URLs.
3. Enable **Google** (and any other) social connections.

## Supabase
1. Create a project; copy the URL + anon key.
2. **Third-party auth**: add Auth0 as the provider (issuer = `VITE_OIDC_ISSUER`) so Supabase validates the Auth0 JWT and RLS reads `auth.jwt()->>'sub'`.
3. Apply migrations: `supabase db push` (or run `supabase/migrations/0001_profiles_friendships.sql` in the SQL editor).

## Manual verification checklist (real backend)
- [ ] Sign in via Auth0 social login; a `profiles` row is created.
- [ ] Generate an invite link; opening it as a second account creates a mutual `accepted` friendship.
- [ ] Each account sees the other in their friends list with the correct display name.
- [ ] Remove friend deletes the row for both.
- [ ] RLS: account A cannot `select` account B's unrelated `friendships` rows (verify in SQL editor with a non-member JWT).
