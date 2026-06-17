# Terraform Phase 2 — Pipeline-Driven Apply & Hardening — Design Spec

**Date:** 2026-06-16
**Status:** Approved (brainstorm) — pending implementation plan
**Builds on:** `2026-06-13-terraform-iac-design.md` (the `golf-env` module + `prod`/`qa` wrappers, HCP local-execution workspaces, already merged to `main`).

## 1. Goal

Run `terraform plan`/`apply` in **GitHub Actions** (not a laptop), gated and hardened, so the very first prod apply happens in CI with no secret ever on the operator's machine. Add **Checkov** as a required security gate. Along the way, **decouple the app's build config from Terraform** so there is no "apply writes GitHub secrets that the deploy then races to read."

### Decisions locked during brainstorm
- **Executor:** GitHub Actions runner; **HCP** holds state (workspaces stay **Local execution**). Runner installs Terraform + the Supabase CLI so the module's two `local-exec` steps run unchanged. *(Section 2)*
- **Secret model:** every credential is **environment-scoped** (nothing powerful at repo level); `prod` environment requires a reviewer, `qa` does not. *(Section 3)*
- **Flow:** PR → checks + Checkov + speculative **qa** plan (PR comment). Push to `main` → **qa auto-applies**, then **prod applies behind the approval gate**. *(Section 4)*
- **Checkov:** **hard-fail** with a documented `.checkov.yaml` baseline. *(Section 5)*
- **App config (the de-circularizing decision):** the `VITE_*` values are **public**, so Terraform stops writing GitHub secrets. Terraform only **`output`s** them; they are set **once as GitHub repository Variables** (`vars.*`), and `ci.yml` reads `vars.*`. The **github provider and `GH_PAT` are removed from the Terraform pipeline entirely.** *(Section 6)*

## 2. Execution model

- **GitHub Actions runs Terraform; HCP stores state.** The `golf-prod`/`golf-qa` workspaces remain **Local execution** — the runner executes `terraform` and pushes state to HCP, authenticated by a stored HCP token (`TF_TOKEN_app_terraform_io`).
- Each Terraform job installs: `hashicorp/setup-terraform` and `supabase/setup-cli` (curl is preinstalled). So `supabase db push` and the third-party-auth `curl` `local-exec` steps run in the runner exactly as locally — **no module logic change for these**.
- The Phase-1 `terraform.yml` (fmt + validate only) **evolves into** this pipeline.

## 3. Secret model & environments

Two GitHub Environments, all credentials **environment-scoped** (duplicated across both; shared values identical, per-tenant/per-project values differ):

| Secret → mapped env var | prod | qa |
|---|---|---|
| `TF_API_TOKEN` → `TF_TOKEN_app_terraform_io` | same | same |
| `SUPABASE_ACCESS_TOKEN` | same | same |
| `AUTH0_DOMAIN` / `AUTH0_CLIENT_ID` / `AUTH0_CLIENT_SECRET` | prod tenant | qa tenant |
| `SUPABASE_DB_PASSWORD` → `TF_VAR_supabase_db_password` | prod project | qa project |

- **No `GH_PAT`** — the Terraform pipeline no longer touches GitHub (Section 6).
- **`prod`** environment has a **required reviewer** (you) → the prod apply job pauses for approval. **`qa`** has no protection rule, so the PR plan job and the auto-apply read it unattended.
- **Bootstrap split:** *I* create both Environments + the `prod` reviewer rule via `gh api` (no values). *You* inject values via `gh secret set <NAME> --env prod|qa`. Values never pass through the assistant.
- **Honest caveat:** Supabase PATs are org-scoped (no per-project token), so that token is powerful regardless of env-scoping; cross-project isolation relies on each env's tfvars targeting the right project.
- **PR-secret access assumption:** environment secrets are available to same-repo PR branches; PRs from forks get none. This is a solo repo, so that's fine.

## 4. Workflow jobs

Triggers: `pull_request` and `push` on `main` (both path-filtered to `terraform/**`), plus `workflow_dispatch` (input `environment: qa|prod`) for manual re-runs during shakeout. Per-environment `concurrency` groups prevent overlapping applies.

1. **`checks`** *(PR + push; no credentials)* — `terraform fmt -check -recursive`; module `init -backend=false` + `validate`; **Checkov** (hard-fail). Gate for everything else.
2. **`plan-qa`** *(PR only; `needs: checks`; `environment: qa`)* — install Terraform + Supabase CLI; `init` + `plan` on `environments/qa`; post the plan as a **sticky PR comment** (`actions/github-script`, built-in token with `pull-requests: write`). `plan` runs no provisioners, so it's read-only.
3. **`apply-qa`** *(push to main; `needs: checks`; `environment: qa`)* — `init` + `apply -auto-approve`; the `local-exec` steps run here against the qa project. Unattended canary.
4. **`apply-prod`** *(push to main; `needs: apply-qa`; `environment: prod`)* — pauses on the reviewer gate; on approval, `init` + `plan` (logged) + `apply -auto-approve` against the prod project.

**Prod-plan visibility caveat (inherent to GitHub gates):** approval happens before the gated job runs, so you approve based on the **qa plan from the PR** (faithful, since prod/qa use the identical module); the prod plan lands in the run logs for audit.

## 5. Checkov

- A `checks`-job step runs Checkov over `terraform/` (the `bridgecrewio/checkov-action`, or `pip install checkov` + CLI), **failing the job on any finding**.
- A committed **`.checkov.yaml`** holds the baseline: `skip-check` entries for accepted exceptions, each with a comment explaining why. Findings are either fixed or explicitly waived there — nothing slips silently.
- **Honest scope:** Checkov's depth is on AWS/Azure/GCP/K8s; its understanding of the `supabase`/`auth0` providers is shallow, so it mostly runs generic Terraform checks (secrets-in-code, sane defaults, `sensitive` flags). Few findings expected, which keeps hard-fail low-friction; the gate still earns its keep as the config grows.

## 6. App config delivery — removing the circular coupling

**The four `VITE_*` values are public** (the Supabase anon key + OIDC config are designed to ship in the client bundle). Only three are produced by `apply` (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OIDC_CLIENT_ID`); `VITE_OIDC_ISSUER` is the known tenant domain.

**Therefore Terraform stops writing GitHub secrets.** Changes:
- **Module refactor (`modules/golf-env`):** remove the `github` provider from `versions.tf`; delete `github_actions_secret`, `github_repository_environment`, and `github_actions_environment_secret`; delete the now-unused `github_repository` and `github_secret_environment` variables (and the `local.vite_secrets`/`use_environment` logic). **Keep the outputs** (`project_url`, `anon_key` (sensitive), `oidc_issuer`, `oidc_client_id`). The env wrappers drop the `github_*` passthroughs. `repo_root` stays (schema push).
- **Delivery:** after the first prod apply, read the values (`terraform output -raw …`) and set them **once** as GitHub **repository Variables** — `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_OIDC_ISSUER`, `VITE_OIDC_CLIENT_ID` — via `gh variable set` (they're public, so the assistant may set them). They change only if the project/app is recreated.
- **`ci.yml` change:** the deploy build reads `VITE_*` from **`vars.*`** instead of `secrets.*`. (Graceful degradation still holds: unset Variables → empty strings → multiplayer dormant.)

**Why this kills the "circularity":**
1. No race — Variables are static config set once; every deploy just reads them, never waiting on a same-push apply.
2. Terraform no longer reaches into GitHub → **the `GH_PAT` (repo secrets-admin, the most powerful credential) is removed from the pipeline** — a direct win for the max-security goal.
3. PR preview builds can read the Variables too (not gated like environment secrets).

The only thing given up is "apply auto-seeds the values" — a one-time set of three public strings, acceptable given they're effectively static.

## 7. First-run orchestration (pipeline-first)

Order, once Section 6's module refactor + workflows are merged:
1. **I** create `prod`/`qa` GitHub Environments + the `prod` reviewer rule (`gh api`).
2. **You** create the per-tenant Auth0 **M2M apps** (qa + prod) and `gh secret set` all env-scoped secrets (Section 3) into each environment; ensure the HCP workspaces are **Local execution**.
3. Merge the Phase-2 PR → `push` triggers **`apply-qa`** (canary; provisions the qa project, registers third-party auth, pushes schema). We watch logs and fix any provider quirks via re-runs (`workflow_dispatch`).
4. **`apply-prod`** pauses → **you approve** → prod provisions.
5. **I** read prod outputs and `gh variable set` the four `VITE_*` repo Variables; then trigger an app deploy so the build picks them up → **multiplayer live**.

(`ci.yml`'s deploy job gains a `workflow_dispatch` trigger so the first post-Variables deploy can be re-run without an empty commit.)

## 8. How the assistant drives it (capability boundary)
- **Assistant (via `gh`):** authors all workflows + `.checkov.yaml` + the module refactor + the `ci.yml` change; creates Environments/protection via `gh api`; triggers runs (`gh workflow run`), watches them (`gh run watch`), reads logs; sets the public `VITE_*` Variables.
- **You only:** inject secret **values** (`gh secret set`), create the Auth0 M2M apps + HCP workspaces, and click **approve** on the prod gate.

## 9. Testing & verification
- **Static, credential-free:** `fmt -check`, module `init -backend=false` + `validate`, Checkov — all run in `checks` and locally.
- **Plan review:** the qa speculative plan on every PR is the human review artifact.
- **Apply verification:** the real provider/RLS path is exercised by the apply itself + the manual checklist in `docs/multiplayer-setup.md` (sign-in → profile → invite → friendship → RLS isolation). Automated qa smoke tests are Phase 4.
- No unit tests for HCL/YAML (not meaningful); correctness rests on validate + Checkov + plan review + the post-apply checklist. Stated plainly.

## 10. Out of scope (later)
- The **Phase-4 smoke-test job** + the smoke-test M2M app (consumes the qa backend stood up here).
- **Cross-workflow auto-trigger** of the app deploy from `apply-prod` (kept manual; `VITE_*` rarely change). Revisit only if it becomes a nuisance.
- Re-introducing any **OIDC** credential federation — not supported by Supabase/Auth0/HCP for our use (Section 3).
- Managing **DDL/RLS** in Terraform — migrations remain the source of truth.
