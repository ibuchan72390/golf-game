# Terraform Phase 2 — Pipeline-Driven Apply Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move `terraform plan`/`apply` into GitHub Actions (gated, Checkov-guarded), and decouple the app's `VITE_*` build config from Terraform by removing the github provider — `VITE_*` become public repo Variables set once from `terraform output`.

**Architecture:** GitHub Actions runs Terraform with HCP for state (workspaces stay local-execution; runner installs the Supabase CLI for the module's `local-exec` steps). PR → checks + Checkov + speculative qa plan (PR comment); push to `main` → qa auto-applies, then prod applies behind a required-reviewer environment gate. The `golf-env` module loses its github provider/resources, keeping only outputs.

**Tech Stack:** Terraform ≥ 1.6 (local 1.14.8), HCP Terraform, providers `supabase/supabase ~> 1.0` + `auth0/auth0 ~> 1.0` (github provider removed), Checkov, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-06-16-terraform-phase2-pipeline-design.md`.

**Done-state:** all files authored and **statically verified** — `terraform fmt`/`validate` on the refactored module, `checkov` exits 0 locally, workflow YAML parses, and `npm run build` still succeeds with empty Variables (multiplayer dormant). A real CI `plan`/`apply` is **operator-triggered after** they seed env secrets, create the Auth0 M2M apps, and approve prod — not part of this plan's execution.

**Verification model:** No unit tests for HCL/YAML. Each task ends with the relevant static check (module `validate`, `checkov`, YAML parse, or `npm run build`). The env wrappers carry a `cloud {}` block, so they're `fmt`-checked only (their `init`/`validate` needs HCP login — operator-side).

---

## File Structure

**Modify:**
- `terraform/modules/golf-env/versions.tf` — drop the `github` provider.
- `terraform/modules/golf-env/variables.tf` — drop `github_repository`, `github_secret_environment`.
- `terraform/modules/golf-env/main.tf` — drop the entire GitHub section (locals + 3 resources).
- `terraform/modules/golf-env/.terraform.lock.hcl` — regenerated (github entry removed).
- `terraform/environments/prod/main.tf`, `terraform/environments/qa/main.tf` — drop `provider "github"`, `variable "github_owner"`, `variable "github_repository"`, and the two github module args.
- `terraform/environments/prod/terraform.tfvars`, `terraform/environments/qa/terraform.tfvars` — drop `github_owner`, `github_repository`.
- `.github/workflows/ci.yml` — deploy build reads `VITE_*` from `vars.*`; add `workflow_dispatch`.
- `.github/workflows/terraform.yml` — replace with the full pipeline.
- `terraform/README.md`, `docs/multiplayer-setup.md` — pipeline flow + `VITE_*` as Variables.

**Create:**
- `.checkov.yaml` — Checkov baseline config.

**Unchanged:** `terraform/modules/golf-env/outputs.tf` (keeps `project_ref`, `project_url`, `anon_key`, `oidc_issuer`, `oidc_client_id`).

---

## Task 1: Strip the github provider out of the module

**Files:** Modify `terraform/modules/golf-env/{versions.tf,variables.tf,main.tf}` (overwrite each with the content below), regenerate the lock.

- [ ] **Step 1: Overwrite `terraform/modules/golf-env/versions.tf`:**

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    supabase = {
      source  = "supabase/supabase"
      version = "~> 1.0"
    }
    auth0 = {
      source  = "auth0/auth0"
      version = "~> 1.0"
    }
  }
}
```

- [ ] **Step 2: Overwrite `terraform/modules/golf-env/variables.tf`:**

```hcl
variable "env" {
  description = "Environment name (e.g. prod, qa). Used in resource names."
  type        = string
}

# --- Supabase ---------------------------------------------------------------
variable "supabase_organization_id" {
  description = "Supabase organization slug."
  type        = string
}

variable "supabase_region" {
  description = "Supabase project region (e.g. us-west-1)."
  type        = string
}

variable "supabase_db_password" {
  description = "Postgres password for the new project. Supply via the env-scoped secret SUPABASE_DB_PASSWORD (TF_VAR_supabase_db_password)."
  type        = string
  sensitive   = true
}

variable "supabase_instance_size" {
  description = "Instance size, or null for the org default (free tier)."
  type        = string
  default     = null
}

# --- Auth0 ------------------------------------------------------------------
variable "auth0_domain" {
  description = "Auth0 tenant domain, used to build the OIDC issuer (https://<domain>/)."
  type        = string
}

variable "app_urls" {
  description = "Allowed callback / logout / web-origin URLs for the SPA (e.g. dev + Pages URLs)."
  type        = list(string)
}

variable "google_oauth_client_id" {
  description = "Optional Google OAuth client id; empty string uses Auth0 dev keys."
  type        = string
  default     = ""
}

variable "google_oauth_client_secret" {
  description = "Optional Google OAuth client secret; empty string uses Auth0 dev keys."
  type        = string
  default     = ""
  sensitive   = true
}

# --- Misc -------------------------------------------------------------------
variable "repo_root" {
  description = "Absolute path to the repository root (for migration files / supabase db push)."
  type        = string
}

variable "oidc_audience" {
  description = "Optional OIDC audience; empty string omits it."
  type        = string
  default     = ""
}
```

- [ ] **Step 3: Overwrite `terraform/modules/golf-env/main.tf`** (Supabase + Auth0 only; GitHub section removed):

```hcl
# --- Supabase project + API keys -------------------------------------------
resource "supabase_project" "this" {
  organization_id   = var.supabase_organization_id
  name              = "golf-${var.env}"
  database_password = var.supabase_db_password
  region            = var.supabase_region
  instance_size     = var.supabase_instance_size
  # Keep legacy JWT-based keys on so the anon_key data source resolves; the app
  # uses the anon key as the apikey header alongside the OIDC bearer token.
  legacy_api_keys_enabled = true

  lifecycle {
    ignore_changes = [instance_size]
  }
}

data "supabase_apikeys" "this" {
  project_ref = supabase_project.this.id
}

locals {
  project_ref = supabase_project.this.id
  project_url = "https://${supabase_project.this.id}.supabase.co"
  issuer      = "https://${var.auth0_domain}/"
}

# --- Register Auth0 as a Supabase third-party-auth (OIDC) issuer ------------
# The supabase provider does not model third-party auth, so call the Management
# API. Idempotent: only POSTs if the issuer is not already registered. Requires
# SUPABASE_ACCESS_TOKEN in the apply environment.
resource "terraform_data" "third_party_auth" {
  triggers_replace = {
    project = local.project_ref
    issuer  = local.issuer
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    environment = {
      REF    = local.project_ref
      ISSUER = local.issuer
    }
    command = <<-EOT
      set -euo pipefail
      base="https://api.supabase.com/v1/projects/$REF/config/auth/third-party-auth"
      existing=$(curl -sf -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" "$base" || echo '[]')
      if echo "$existing" | grep -q "$ISSUER"; then
        echo "third-party-auth issuer already registered: $ISSUER"
      else
        curl -sf -X POST "$base" \
          -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
          -H "Content-Type: application/json" \
          -d "{\"oidc_issuer_url\": \"$ISSUER\"}"
        echo "registered third-party-auth issuer: $ISSUER"
      fi
    EOT
  }

  depends_on = [supabase_project.this]
}

# --- Apply the SQL migration to the new project -----------------------------
# supabase/migrations is the source of truth for schema + RLS. Re-runs when any
# migration file changes. Requires the Supabase CLI + SUPABASE_ACCESS_TOKEN.
resource "terraform_data" "schema_push" {
  triggers_replace = {
    project = local.project_ref
    migrations = sha256(join(",", [
      for f in fileset("${var.repo_root}/supabase/migrations", "*.sql") :
      filesha256("${var.repo_root}/supabase/migrations/${f}")
    ]))
  }

  provisioner "local-exec" {
    interpreter = ["bash", "-c"]
    working_dir = var.repo_root
    environment = {
      DBURL = "postgresql://postgres:${var.supabase_db_password}@db.${local.project_ref}.supabase.co:5432/postgres"
    }
    command = "supabase db push --db-url \"$DBURL\" --yes"
  }

  depends_on = [supabase_project.this]
}

# --- Auth0 SPA application --------------------------------------------------
resource "auth0_client" "spa" {
  name            = "golf-game-${var.env}"
  app_type        = "spa"
  oidc_conformant = true
  grant_types     = ["authorization_code", "refresh_token"]

  callbacks           = var.app_urls
  allowed_logout_urls = var.app_urls
  web_origins         = var.app_urls
  allowed_origins     = var.app_urls
}

# Per-env Google social connection, enabled only for this env's client. Empty
# client_id/secret falls back to Auth0 dev keys (fine for non-production use).
resource "auth0_connection" "google" {
  name     = "golf-google-${var.env}"
  strategy = "google-oauth2"

  options {
    client_id     = var.google_oauth_client_id
    client_secret = var.google_oauth_client_secret
    scopes        = ["email", "profile"]
  }
}

resource "auth0_connection_clients" "google" {
  connection_id   = auth0_connection.google.id
  enabled_clients = [auth0_client.spa.client_id]
}
```

- [ ] **Step 4: Confirm `outputs.tf` is unchanged** — it must still contain `project_ref`, `project_url`, `anon_key` (sensitive), `oidc_issuer`, `oidc_client_id`. Do not edit it. (Read it to confirm; if any output referenced a now-deleted resource, that would be a bug — it does not: all outputs reference `local.*`, `data.supabase_apikeys.this`, or `auth0_client.spa`, all of which remain.)

- [ ] **Step 5: Regenerate the lock + validate (github drops out of the lock)**

Run (from repo root):
```bash
terraform -chdir=terraform/modules/golf-env fmt
terraform -chdir=terraform/modules/golf-env init -backend=false -input=false -upgrade
terraform -chdir=terraform/modules/golf-env validate
```
Expected: `-upgrade` rewrites `.terraform.lock.hcl` to contain only `supabase` + `auth0`; validate prints "Success! The configuration is valid." (the `legacy_api_keys_enabled` deprecation warning is expected). Confirm `grep -c github terraform/modules/golf-env/.terraform.lock.hcl` returns `0`.

- [ ] **Step 6: Commit**

```bash
git add terraform/modules/golf-env/
git commit -m "refactor(tf): remove github provider from golf-env module (VITE config moves to repo Variables)"
```

---

## Task 2: Drop github from the env wrappers + tfvars

**Files:** Overwrite `terraform/environments/prod/main.tf`, `terraform/environments/qa/main.tf`, and both `terraform.tfvars`.

- [ ] **Step 1: Overwrite `terraform/environments/prod/main.tf`:**

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    supabase = { source = "supabase/supabase", version = "~> 1.0" }
    auth0    = { source = "auth0/auth0", version = "~> 1.0" }
  }
  # HCP Terraform remote state. Set TF_CLOUD_ORGANIZATION in the environment.
  # Workspace must use LOCAL execution mode.
  cloud {
    workspaces { name = "golf-prod" }
  }
}

# Providers read credentials from the environment:
#   supabase: SUPABASE_ACCESS_TOKEN
#   auth0:    AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET
provider "supabase" {}
provider "auth0" {}

variable "supabase_organization_id" { type = string }
variable "supabase_region" { type = string }
variable "supabase_db_password" {
  type      = string
  sensitive = true
}
variable "auth0_domain" { type = string }
variable "app_urls" { type = list(string) }
variable "oidc_audience" {
  type    = string
  default = ""
}

module "env" {
  source = "../../modules/golf-env"

  env                      = "prod"
  supabase_organization_id = var.supabase_organization_id
  supabase_region          = var.supabase_region
  supabase_db_password     = var.supabase_db_password
  auth0_domain             = var.auth0_domain
  app_urls                 = var.app_urls
  oidc_audience            = var.oidc_audience
  repo_root                = abspath("${path.root}/../../..")
}

output "project_url" { value = module.env.project_url }
output "oidc_issuer" { value = module.env.oidc_issuer }
output "oidc_client_id" { value = module.env.oidc_client_id }
output "anon_key" {
  value     = module.env.anon_key
  sensitive = true
}
```

(Note: `anon_key` is re-exported so the operator can `terraform output -raw anon_key` to set the Variable.)

- [ ] **Step 2: Overwrite `terraform/environments/qa/main.tf`** (same, but `golf-qa` workspace + `env = "qa"`):

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    supabase = { source = "supabase/supabase", version = "~> 1.0" }
    auth0    = { source = "auth0/auth0", version = "~> 1.0" }
  }
  cloud {
    workspaces { name = "golf-qa" }
  }
}

provider "supabase" {}
provider "auth0" {}

variable "supabase_organization_id" { type = string }
variable "supabase_region" { type = string }
variable "supabase_db_password" {
  type      = string
  sensitive = true
}
variable "auth0_domain" { type = string }
variable "app_urls" { type = list(string) }
variable "oidc_audience" {
  type    = string
  default = ""
}

module "env" {
  source = "../../modules/golf-env"

  env                      = "qa"
  supabase_organization_id = var.supabase_organization_id
  supabase_region          = var.supabase_region
  supabase_db_password     = var.supabase_db_password
  auth0_domain             = var.auth0_domain
  app_urls                 = var.app_urls
  oidc_audience            = var.oidc_audience
  repo_root                = abspath("${path.root}/../../..")
}

output "project_url" { value = module.env.project_url }
output "oidc_issuer" { value = module.env.oidc_issuer }
output "oidc_client_id" { value = module.env.oidc_client_id }
output "anon_key" {
  value     = module.env.anon_key
  sensitive = true
}
```

- [ ] **Step 3: Overwrite `terraform/environments/prod/terraform.tfvars`** (drop github_owner/github_repository):

```hcl
supabase_organization_id = "bspfrnyivapfpkkgrcjq"
supabase_region          = "us-west-1"
auth0_domain             = "ian-golf-game-prod.us.auth0.com"
app_urls = [
  "http://localhost:5173",
  "https://ibuchan72390.github.io/golf-game/",
]
```

- [ ] **Step 4: Overwrite `terraform/environments/qa/terraform.tfvars`:**

```hcl
supabase_organization_id = "bspfrnyivapfpkkgrcjq"
supabase_region          = "us-west-1"
auth0_domain             = "ian-golf-game-qa.us.auth0.com"
# QA has no hosted frontend; localhost covers smoke-test/local builds pointed at QA.
app_urls = [
  "http://localhost:5173",
  "http://localhost:4173",
]
```

- [ ] **Step 5: fmt both envs + module validate**

Run:
```bash
terraform -chdir=terraform/environments/prod fmt
terraform -chdir=terraform/environments/qa fmt
terraform -chdir=terraform/modules/golf-env validate
```
Expected: fmt clean on both; module validate "Success!". Do NOT `init`/`validate` the env dirs (the `cloud {}` block needs HCP login). Confirm `grep -rc github terraform/environments` returns `0` for all files.

- [ ] **Step 6: Commit**

```bash
git add terraform/environments/
git commit -m "refactor(tf): drop github provider/vars from prod+qa wrappers"
```

---

## Task 3: ci.yml — read VITE_* from Variables + dispatchable deploy

**Files:** Modify `.github/workflows/ci.yml`.

- [ ] **Step 1: Add `workflow_dispatch` to the `on:` trigger.** Replace the `on:` block at the top:

```yaml
on:
  push:
    branches: [main]
  pull_request:
  workflow_dispatch:
```

- [ ] **Step 2: Allow the deploy job to run on manual dispatch.** Find the `deploy:` job's `if:` line:
`    if: github.event_name == 'push' && github.ref == 'refs/heads/main'`
and replace it with:
```yaml
    if: (github.event_name == 'push' && github.ref == 'refs/heads/main') || github.event_name == 'workflow_dispatch'
```

- [ ] **Step 3: Switch the build step's env from `secrets.*` to `vars.*`.** Replace the `env:` block under the deploy job's `npm run build` step with:

```yaml
        env:
          VITE_SUPABASE_URL: ${{ vars.VITE_SUPABASE_URL }}
          VITE_SUPABASE_ANON_KEY: ${{ vars.VITE_SUPABASE_ANON_KEY }}
          VITE_OIDC_ISSUER: ${{ vars.VITE_OIDC_ISSUER }}
          VITE_OIDC_CLIENT_ID: ${{ vars.VITE_OIDC_CLIENT_ID }}
          VITE_OIDC_AUDIENCE: ${{ vars.VITE_OIDC_AUDIENCE }}
          VITE_OIDC_REDIRECT_URI: ${{ vars.VITE_OIDC_REDIRECT_URI }}
```

- [ ] **Step 4: Verify YAML parses + the app still builds dormant**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/ci.yml')); print('ci.yml OK')"
npm ci
npm run build
```
Expected: `ci.yml OK`; build succeeds (with no Variables set locally, `import.meta.env.VITE_*` are undefined → `readConfig` returns null → multiplayer dormant; this is the same graceful-degradation already covered by tests). If `python`/`yaml` is unavailable, skip the parse line and rely on visual review + Step 5 of Task 5's parse check pattern.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/ci.yml
git commit -m "ci: read VITE_* from repo Variables; allow manual deploy dispatch"
```

---

## Task 4: Checkov baseline

**Files:** Create `.checkov.yaml`.

- [ ] **Step 1: Create `.checkov.yaml`:**

```yaml
# Checkov configuration for the Terraform under terraform/.
# Hard-fail (soft-fail is off by default). Any intentional exception goes in
# skip-check below WITH a comment explaining why.
framework:
  - terraform
directory:
  - terraform
skip-check: []
```

- [ ] **Step 2: Install Checkov and run it**

Run:
```bash
python -m pip install --quiet checkov
checkov --config-file .checkov.yaml
```
Expected: it scans `terraform/` and prints a results summary.

- [ ] **Step 3: Baseline the findings (this is the defined process, not a placeholder)**

For each FAILED check Checkov reports:
- If it's a real, fixable misconfiguration in our HCL, fix the HCL.
- If it's a false positive or an accepted risk (e.g. a check targeting a resource type we don't really control, or the known `legacy_api_keys_enabled` choice), add its check id to `skip-check` with an inline comment, e.g.:

```yaml
skip-check:
  - "CKV_XXX_999"  # <reason this is safe/accepted for our setup>
```

Re-run `checkov --config-file .checkov.yaml` until it exits `0`. Confirm with:
```bash
checkov --config-file .checkov.yaml; echo "exit=$?"
```
Expected: `exit=0`. Report which (if any) check ids you skipped and why.

- [ ] **Step 4: Commit**

```bash
git add .checkov.yaml
git commit -m "ci(tf): add Checkov baseline config (hard-fail)"
```

---

## Task 5: terraform.yml — the full pipeline

**Files:** Overwrite `.github/workflows/terraform.yml`.

- [ ] **Step 1: Overwrite `.github/workflows/terraform.yml`:**

```yaml
name: Terraform

on:
  pull_request:
    paths: ['terraform/**', '.github/workflows/terraform.yml', '.checkov.yaml']
  push:
    branches: [main]
    paths: ['terraform/**', '.github/workflows/terraform.yml', '.checkov.yaml']
  workflow_dispatch:
    inputs:
      environment:
        description: 'Environment to apply'
        type: choice
        options: [qa, prod]
        default: qa

permissions:
  contents: read
  pull-requests: write

env:
  TF_CLOUD_ORGANIZATION: ibuchan-org
  TF_IN_AUTOMATION: "1"

jobs:
  checks:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.9.8"
          terraform_wrapper: false
      - name: fmt
        run: terraform -chdir=terraform fmt -check -recursive
      - name: validate module
        run: |
          terraform -chdir=terraform/modules/golf-env init -backend=false -input=false
          terraform -chdir=terraform/modules/golf-env validate
      - name: Checkov
        uses: bridgecrewio/checkov-action@v12
        with:
          directory: terraform
          config_file: .checkov.yaml
          quiet: true

  plan-qa:
    if: github.event_name == 'pull_request'
    needs: checks
    runs-on: ubuntu-latest
    environment: qa
    env:
      TF_TOKEN_app_terraform_io: ${{ secrets.TF_API_TOKEN }}
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      AUTH0_DOMAIN: ${{ secrets.AUTH0_DOMAIN }}
      AUTH0_CLIENT_ID: ${{ secrets.AUTH0_CLIENT_ID }}
      AUTH0_CLIENT_SECRET: ${{ secrets.AUTH0_CLIENT_SECRET }}
      TF_VAR_supabase_db_password: ${{ secrets.SUPABASE_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.9.8"
          terraform_wrapper: true
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - name: init
        run: terraform -chdir=terraform/environments/qa init -input=false
      - name: plan
        id: plan
        run: terraform -chdir=terraform/environments/qa plan -no-color -input=false
        continue-on-error: true
      - name: comment plan
        uses: actions/github-script@v7
        env:
          PLAN: ${{ steps.plan.outputs.stdout }}
          OUTCOME: ${{ steps.plan.outcome }}
        with:
          script: |
            const marker = '<!-- tf-plan-qa -->';
            const plan = (process.env.PLAN || '').substring(0, 60000);
            const body = `${marker}\n#### Terraform Plan (qa) \`${process.env.OUTCOME}\`\n\n<details><summary>Show plan</summary>\n\n\`\`\`\n${plan}\n\`\`\`\n\n</details>`;
            const { owner, repo } = context.repo;
            const issue_number = context.issue.number;
            const { data: comments } = await github.rest.issues.listComments({ owner, repo, issue_number });
            const existing = comments.find(c => c.body && c.body.includes(marker));
            if (existing) {
              await github.rest.issues.updateComment({ owner, repo, comment_id: existing.id, body });
            } else {
              await github.rest.issues.createComment({ owner, repo, issue_number, body });
            }
      - name: fail if plan errored
        if: steps.plan.outcome == 'failure'
        run: |
          echo "terraform plan failed (see PR comment)"; exit 1

  apply-qa:
    if: (github.event_name == 'push') || (github.event_name == 'workflow_dispatch' && inputs.environment == 'qa')
    needs: checks
    runs-on: ubuntu-latest
    environment: qa
    concurrency:
      group: tf-apply-qa
      cancel-in-progress: false
    env:
      TF_TOKEN_app_terraform_io: ${{ secrets.TF_API_TOKEN }}
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      AUTH0_DOMAIN: ${{ secrets.AUTH0_DOMAIN }}
      AUTH0_CLIENT_ID: ${{ secrets.AUTH0_CLIENT_ID }}
      AUTH0_CLIENT_SECRET: ${{ secrets.AUTH0_CLIENT_SECRET }}
      TF_VAR_supabase_db_password: ${{ secrets.SUPABASE_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.9.8"
          terraform_wrapper: false
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: terraform -chdir=terraform/environments/qa init -input=false
      - run: terraform -chdir=terraform/environments/qa apply -auto-approve -input=false

  apply-prod:
    needs: [checks, apply-qa]
    if: |
      always() &&
      needs.checks.result == 'success' &&
      (needs.apply-qa.result == 'success' || needs.apply-qa.result == 'skipped') &&
      ((github.event_name == 'push') || (github.event_name == 'workflow_dispatch' && inputs.environment == 'prod'))
    runs-on: ubuntu-latest
    environment: prod
    concurrency:
      group: tf-apply-prod
      cancel-in-progress: false
    env:
      TF_TOKEN_app_terraform_io: ${{ secrets.TF_API_TOKEN }}
      SUPABASE_ACCESS_TOKEN: ${{ secrets.SUPABASE_ACCESS_TOKEN }}
      AUTH0_DOMAIN: ${{ secrets.AUTH0_DOMAIN }}
      AUTH0_CLIENT_ID: ${{ secrets.AUTH0_CLIENT_ID }}
      AUTH0_CLIENT_SECRET: ${{ secrets.AUTH0_CLIENT_SECRET }}
      TF_VAR_supabase_db_password: ${{ secrets.SUPABASE_DB_PASSWORD }}
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.9.8"
          terraform_wrapper: false
      - uses: supabase/setup-cli@v1
        with:
          version: latest
      - run: terraform -chdir=terraform/environments/prod init -input=false
      - run: terraform -chdir=terraform/environments/prod plan -input=false
      - run: terraform -chdir=terraform/environments/prod apply -auto-approve -input=false
```

- [ ] **Step 2: Verify YAML parses + fmt unaffected**

Run:
```bash
python -c "import yaml; yaml.safe_load(open('.github/workflows/terraform.yml')); print('terraform.yml OK')"
terraform -chdir=terraform fmt -check -recursive
```
Expected: `terraform.yml OK`; fmt exit 0. (If `python`/`yaml` is unavailable, carefully visual-review indentation: `checks`/`plan-qa`/`apply-qa`/`apply-prod` are siblings under `jobs:`; the `if:` block scalar on `apply-prod` uses `|`.)

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/terraform.yml
git commit -m "ci(tf): pipeline — checks+checkov, qa plan on PR, qa auto-apply, prod gated apply"
```

---

## Task 6: Docs — pipeline flow + VITE_* as Variables

**Files:** Modify `terraform/README.md`, `docs/multiplayer-setup.md`.

- [ ] **Step 1: Replace the "Provision" and "Notes" sections of `terraform/README.md`** with a pipeline-first runbook. Open `terraform/README.md`; keep the title + "One-time manual bootstrap" intro, but replace everything from the "## Per-run environment variables" heading onward with:

````markdown
## Pipeline-driven provisioning (primary)

Terraform runs in GitHub Actions, not locally. Bootstrap once, then it's automated.

### One-time bootstrap
1. **HCP Terraform:** org `ibuchan-org`; workspaces `golf-prod` and `golf-qa`, both **Local execution**. (State only; the GitHub runner executes.)
2. **Auth0:** create a Management-API **M2M app in each tenant** (`ian-golf-game-prod`, `ian-golf-game-qa`) with scopes `create:clients read:clients update:clients create:connections read:connections update:connections`.
3. **Supabase:** a personal access token.
4. **GitHub Environments + secrets:** create the `prod` (required reviewer = you) and `qa` environments, then set the env-scoped secrets in each:
   `TF_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `SUPABASE_DB_PASSWORD`.
   (`TF_API_TOKEN` + `SUPABASE_ACCESS_TOKEN` are the same value in both; the Auth0 trio + db password differ per environment.)

### Provision
- **PR** touching `terraform/**` → `fmt` + `validate` + **Checkov** + a speculative **qa plan** posted as a PR comment (your review artifact).
- **Merge to `main`** → **qa applies automatically**, then **prod waits on your approval** (the `prod` environment gate). Approve it in the Actions run.
- `workflow_dispatch` (Actions tab → Terraform → Run workflow → pick `qa`/`prod`) re-applies a single environment without a new commit (useful for first-run shakeout).

### App config (`VITE_*`) — set once, by hand, from outputs
`VITE_*` are **public** values, so they are GitHub repository **Variables**, not secrets, and Terraform does not write them. After the first prod apply, read the outputs and set the Variables once:
```bash
cd terraform/environments/prod
gh variable set VITE_SUPABASE_URL      --body "$(terraform output -raw project_url)"
gh variable set VITE_SUPABASE_ANON_KEY --body "$(terraform output -raw anon_key)"
gh variable set VITE_OIDC_ISSUER       --body "$(terraform output -raw oidc_issuer)"
gh variable set VITE_OIDC_CLIENT_ID    --body "$(terraform output -raw oidc_client_id)"
```
Then trigger the app deploy (Actions → CI → Run workflow, or push) so the build bakes them in. They change only if the project/app is recreated.

## Notes
- **Schema** is owned by `supabase/migrations/`, applied by the `schema_push` step (`supabase db push`) in the runner.
- **Third-party auth** is registered via the Supabase Management API by the `third_party_auth` step (the provider doesn't model it).
- **Auth0:** each env is its own tenant with its own M2M app; the apply job uses that environment's `AUTH0_*` secrets. Each env also creates its own `google-oauth2` connection (`golf-google-<env>`).
- **State** is in HCP (Local execution) and contains secrets — never committed.
````

- [ ] **Step 2: Update the "Provisioning the backend" section of `docs/multiplayer-setup.md`.** Replace the Terraform bullet's parenthetical so it reflects Variables + pipeline. Find the bullet starting `- **Terraform (recommended, reproducible):**` and replace that bullet with:

```markdown
- **Terraform + CI (recommended):** `terraform/` provisions Supabase + Auth0 per environment via a gated GitHub Actions pipeline (qa auto, prod approval). The public `VITE_*` build values are then set once as repo **Variables** from `terraform output`. See [`terraform/README.md`](../terraform/README.md).
```

Also update the `VITE_*` table note: change the line `## Required env (\`.env\`, or GitHub Actions secrets at build time)` to `## Required env (\`.env\` locally, or GitHub repo **Variables** at build time)`.

- [ ] **Step 3: Verify formatting unaffected**

Run:
```bash
terraform -chdir=terraform fmt -check -recursive
```
Expected: exit 0 (docs don't touch `.tf`).

- [ ] **Step 4: Commit**

```bash
git add terraform/README.md docs/multiplayer-setup.md
git commit -m "docs(tf): pipeline-driven runbook + VITE_* as repo Variables"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §1/§6 remove github provider, VITE_* via Variables → Tasks 1, 2 (module + wrappers + tfvars), 3 (ci.yml `vars.*`), 6 (README `gh variable set`). `anon_key` re-exported on wrappers (Task 2) so `terraform output -raw` works.
- §2 GH-Actions executor + HCP state + Supabase CLI → Task 5 (every apply/plan job installs `supabase/setup-cli`; `TF_CLOUD_ORGANIZATION` env; HCP token).
- §3 env-scoped secrets, prod gated → Task 5 (`environment: qa|prod`, secret→env mapping); environment creation/secret seeding is operator bootstrap (README, Task 6) — not code.
- §4 trigger map (PR checks+plan-qa; push qa→prod gated; dispatch) → Task 5 job `if:`/`needs:`/`concurrency`. Manual-dispatch-prod path handled via `always()` + skipped-apply-qa clause.
- §5 Checkov hard-fail + baseline → Task 4 (`.checkov.yaml`, run-and-baseline process) + Task 5 (`checks` job step).
- §7 first-run order, §8 capability boundary → Task 6 README runbook.
- §9 verification → per-task static checks; §10 out-of-scope (smoke job, auto-deploy trigger) correctly absent.

**Placeholder scan:** No plan-failure placeholders. Task 4 Step 3 is a *defined baselining procedure* (run → fix or document-skip → re-run to exit 0), not a vague TODO; we can't know findings offline, so the process is the deliverable. Provider-version pins and the `1.9.8` setup-terraform version match Phase 1.

**Consistency:** Variable set after refactor (`env`, `supabase_organization_id`, `supabase_region`, `supabase_db_password`, `supabase_instance_size`, `auth0_domain`, `app_urls`, `google_oauth_client_id`, `google_oauth_client_secret`, `repo_root`, `oidc_audience`) matches between module `variables.tf` (Task 1) and wrapper module calls (Task 2) — no wrapper passes a variable the module doesn't declare, and the module declares none the wrappers must supply except defaults. Outputs (`project_url`, `oidc_issuer`, `oidc_client_id`, `anon_key`) consistent across module `outputs.tf`, wrapper re-exports (Task 2), and the `gh variable set` reads (Task 6). Secret names (`TF_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `AUTH0_DOMAIN/CLIENT_ID/CLIENT_SECRET`, `SUPABASE_DB_PASSWORD`) identical between the secret-seeding script, the spec table, and the workflow `env:` blocks (Task 5). `vars.VITE_*` names (Task 3) match the `gh variable set` names (Task 6) and the app's `readConfig` keys.
