# Terraform IaC — Design Spec

**Date:** 2026-06-13
**Status:** Approved (brainstorm) — pending implementation plan
**Relates to:** the deferred "QA-environment / IaC" phase of `2026-06-13-multiplayer-mvp-design.md` (§7).

## 1. Goal & scope

Provision the golf-game multiplayer backend with Terraform, as a **reusable root-module instantiated per environment**, so standing up an environment is `terraform apply` instead of manual console clicking. Two environments now: **`prod`** (backs the live GitHub Pages site) and **`qa`** (backend-only, for the future Phase-4 smoke tests — there is no separately-hosted QA frontend; QA is exercised by builds/tests pointed at QA credentials).

Per environment, Terraform owns:
- a **Supabase project** (+ third-party-auth trust of the Auth0 issuer),
- an **Auth0 application** (SPA, social login, callback/logout/origin URLs),
- the **GitHub Actions secrets** that carry the `VITE_*` config into builds,
- application of the **database schema** via `supabase db push` (migrations remain the source of truth).

### Decisions locked during brainstorm
- **Environments:** `prod` + `qa` now; module designed so more are added as tfvars instantiations. *(Option B)*
- **State backend:** **HCP Terraform** (Terraform Cloud) free tier, one workspace per env. *(Option A)*
- **Layout:** in-repo `terraform/` with a reusable local module. *(Option 1A)*
- **Ownership:** Terraform manages Supabase + Auth0 + GitHub secrets. *(Option 2A)*
- **Schema:** Terraform provisions the project/auth; the SQL migration stays the source of truth, applied via `supabase db push`. *(Option 3)*
- **Auth0 topology:** one tenant, two applications (prod/qa), distinguished by callback URLs.
- **GitHub secret scoping:** prod → repo-level secrets (consumed by the current deploy job); qa → a GitHub **Environment** named `qa` (consumed by the future smoke job).
- **HCP execution mode:** **Local** (apply runs on the operator's machine so the `supabase db push` local step and the Supabase CLI are available; state still lives in HCP).

## 2. Architecture & layout

```
terraform/
  modules/
    golf-env/            # reusable module = one complete environment
      main.tf            # supabase project, auth0 app, github secrets, schema push
      variables.tf       # env name, region, urls, org/tenant ids, secret scope, ...
      outputs.tf         # project_url, anon_key, issuer, client_id (sensitive where apt)
      versions.tf        # required_providers (supabase, auth0, github, null/terraform_data)
  environments/
    prod/
      main.tf            # cloud{} → HCP workspace "golf-prod"; calls module "golf-env"
      terraform.tfvars   # NON-secret prod config (names, region, urls, scope=repo)
    qa/
      main.tf            # cloud{} → HCP workspace "golf-qa"; calls module "golf-env"
      terraform.tfvars   # NON-secret qa config (scope=environment:qa)
  README.md              # bootstrap + run instructions, pointers to credentials
```

- **`golf-env` module** is the single source of truth for "what an environment is." Each `environments/<env>` is a thin wrapper: a `cloud {}` block selecting the HCP workspace + a module call with env-specific variables. This is the root-module pattern requested.
- **Providers:** `supabase/supabase`, `auth0/auth0`, `integrations/github`, and `null`/`terraform_data` (for the schema-push local-exec).
- **Runs are CLI-driven** (`terraform -chdir=terraform/environments/prod plan|apply`) with **state in HCP**. Local execution mode is required so the schema-push step and Supabase CLI run in the operator's context.

## 3. What the module provisions (per environment)

1. **Supabase project** — `supabase_project` (org id, name like `golf-<env>`, region, db password). Then configure **third-party auth** so the project trusts the Auth0 issuer (RLS reads `auth.jwt()->>'sub'`).
   - *Provider-capability risk (resolve in plan):* retrieving the project's **anon key + URL** and configuring **third-party auth** may exceed what the `supabase` Terraform provider exposes today. Fallback: a `terraform_data` + `local-exec` (or `http`/external data source) calling the **Supabase Management API**/CLI to read keys and register the third-party issuer, capturing outputs for the GitHub-secret step. The plan must verify provider support first and choose provider-native vs Management-API fallback.
2. **Auth0 application** — `auth0_client` (SPA), allowed callback/logout/web-origin URLs from an `urls` variable, plus a **Google social connection** enabled for the app (`auth0_connection` + `auth0_connection_clients`).
   - Google connection uses Auth0 dev keys initially; for real prod sign-in, optional `google_oauth_client_id`/`secret` variables (sensitive) supply your own Google OAuth credentials.
   - Outputs: `issuer` (tenant domain), `client_id`.
3. **GitHub Actions secrets** — write `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID` (+ optional `VITE_OIDC_AUDIENCE`, `VITE_OIDC_REDIRECT_URI`). A `secret_scope` variable selects the target: `repo` (prod → `github_actions_secret`) or `environment:<name>` (qa → `github_actions_environment_secret` under a TF-managed `github_repository_environment "qa"`). The existing deploy job already reads the repo-level `VITE_*` (no workflow change needed for prod).
4. **Schema push** — a `terraform_data` resource with `local-exec` running `supabase link` + `supabase db push` against the new project (using `SUPABASE_ACCESS_TOKEN` + the db password), `depends_on` the project. Re-runs when the migration set changes (triggers keyed off the migration files' hash). Requires the **Supabase CLI installed locally**.

## 4. Credentials & secret handling

All provider credentials are supplied as **environment variables on the operator's machine — never committed, never pasted into chat**:

| Purpose | Mechanism |
| --- | --- |
| Supabase provider + CLI | `SUPABASE_ACCESS_TOKEN` (personal access token); org id is a non-secret var |
| Auth0 provider (Management API) | `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET` (a Management M2M app) |
| GitHub provider | `GITHUB_TOKEN` (PAT: repo + secrets admin) |
| HCP Terraform | `terraform login` / `TF_TOKEN_app_terraform_io` |
| Sensitive tfvars (db password, Google OAuth secret) | **HCP workspace variables marked sensitive** — not in `.tfvars` files |

- Committed `*.tfvars` hold **only non-sensitive** config (project names, region, URLs, org id, secret scope).
- Module outputs carrying keys are marked `sensitive = true`. State (in HCP, encrypted at rest) will contain secrets — that's expected and why HCP (not local/committed) state was chosen.
- `.gitignore` additions: `terraform/**/.terraform/*`, `*.tfstate`, `*.tfstate.*`, `crash.log`, `*.tfvars.local`.

### Irreducible manual bootstrap (one-time, documented in `terraform/README.md`)
Terraform cannot create the credentials it authenticates with. The operator manually, once:
1. Creates an **HCP Terraform** account/org + the two workspaces (`golf-prod`, `golf-qa`) set to **Local execution**.
2. Creates a **Supabase personal access token** (and notes the org id).
3. Creates an **Auth0 Management M2M application** (grants the Management API scopes Terraform needs) → provides domain/client-id/secret.
4. Creates a **GitHub PAT** with repo + secrets-admin scope.
5. Installs the **Supabase CLI** locally.

## 5. Testing & validation

- **Static (CI-able without credentials):** `terraform fmt -check -recursive` and, per env, `terraform init -backend=false && terraform validate`. Add a **separate CI workflow** (`terraform.yml`) running these on changes under `terraform/` — no secrets required, so it can't leak and won't block on missing credentials. (The app's existing `ci.yml` is unchanged.)
- **Dry-run:** `terraform plan` per env is the human review gate before `apply`.
- **Post-apply verification:** the existing manual checklist in `docs/multiplayer-setup.md` validates the provisioned backend end-to-end (sign-in → profile row → invite → friendship → RLS isolation). Phase 4 will automate this against `qa`.
- No unit tests for HCL (not meaningful); correctness rests on `validate` + `plan` review + the post-apply checklist. This limitation is stated plainly.

## 6. Operational flow (once bootstrapped)

```
export SUPABASE_ACCESS_TOKEN=… AUTH0_DOMAIN=… AUTH0_CLIENT_ID=… AUTH0_CLIENT_SECRET=… GITHUB_TOKEN=…
terraform -chdir=terraform/environments/prod init
terraform -chdir=terraform/environments/prod plan     # review
terraform -chdir=terraform/environments/prod apply     # provisions + seeds secrets + pushes schema
# then trigger a Pages deploy → multiplayer is live
```

`qa` is the same with `environments/qa`. Tearing down a throwaway env is `terraform destroy` in that env dir.

## 7. Out of scope (later phases)
- The **Phase-4 smoke-test workflow** itself and the **smoke-test M2M client-credentials app** (the Auth0 app the smoke suite logs in *as*) — that's built with Phase 4; this spec only stands up the `qa` backend + the `qa` secret scope it will consume.
- Extracting `golf-env` into a **separate reusable infra repo** — deferred until a second app needs it; the in-repo module is structured to be liftable.
- Managing **DDL/RLS in Terraform** — intentionally never; migrations own the schema.
- Real **Google OAuth credentials** are optional inputs; Auth0 dev keys suffice until you want production-grade Google sign-in.
