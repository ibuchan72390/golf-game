# Terraform IaC Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision the golf-game multiplayer backend (Supabase project + Auth0 SPA app + GitHub Actions secrets + DB schema) as a reusable Terraform root-module instantiated per environment (`prod`, `qa`), with state in HCP Terraform.

**Architecture:** An in-repo `terraform/` tree: one reusable `modules/golf-env` module = "one complete environment," wrapped by thin `environments/{prod,qa}` root configs (each a `cloud {}` block selecting an HCP workspace + a module call with env tfvars). The module uses provider-native resources where possible (`supabase_project`, `supabase_apikeys` data source, `auth0_client`, `auth0_connection`, `github_actions_secret`/`_environment_secret`) and `terraform_data` + `local-exec` for the two things providers don't cover: registering the Auth0 issuer as a Supabase third-party-auth provider (Management API), and applying the SQL migration (`supabase db push`).

**Tech Stack:** Terraform ≥ 1.6, HCP Terraform (remote state, local execution), providers `supabase/supabase ~> 1.0`, `auth0/auth0 ~> 1.0`, `integrations/github ~> 6.0`; Supabase CLI + `bash`/`curl` for the local-exec steps.

**Spec:** `docs/superpowers/specs/2026-06-13-terraform-iac-design.md`.

**Done-state of this plan:** all HCL + the `terraform.yml` CI workflow + `.gitignore` additions + `terraform/README.md` bootstrap docs authored and **statically verified** (`fmt`, `init -backend=false`, `validate` on the module). A real `terraform plan`/`apply` is **operator-run after the manual credential bootstrap** (documented in §README) — not part of this plan's execution. Verification commands below never need cloud credentials.

**Verification model (read first):** There is no unit-test loop for HCL. Each module task ends with, run from the repo root:
```bash
terraform -chdir=terraform/modules/golf-env fmt
terraform -chdir=terraform/modules/golf-env init -backend=false -input=false
terraform -chdir=terraform/modules/golf-env validate
```
`validate` downloads provider schemas and checks every resource/attribute name against them (no credentials, no API calls), so it catches the kind of errors that matter here. The `cloud {}` blocks live only in the env wrappers (Task 6), which is why the module validates credential-free.

---

## File Structure

**Create:**
- `terraform/modules/golf-env/versions.tf` — `terraform` block + `required_providers`.
- `terraform/modules/golf-env/variables.tf` — all module inputs.
- `terraform/modules/golf-env/main.tf` — Supabase + third-party-auth + schema-push + Auth0 + GitHub secrets.
- `terraform/modules/golf-env/outputs.tf` — issuer, client_id, project_url, anon_key (sensitive).
- `terraform/environments/prod/main.tf`, `terraform/environments/prod/terraform.tfvars`
- `terraform/environments/qa/main.tf`, `terraform/environments/qa/terraform.tfvars`
- `terraform/README.md` — bootstrap prerequisites + run flow.
- `supabase/config.toml` — minimal Supabase CLI project config (so `supabase db push` recognizes the dir).
- `.github/workflows/terraform.yml` — fmt/validate CI (no secrets).

**Modify:**
- `.gitignore` — Terraform ignores.
- `docs/multiplayer-setup.md` — point to the Terraform path as primary provisioning.

---

## Task 1: Scaffold — gitignore, provider requirements, Supabase CLI config

**Files:**
- Modify: `.gitignore`
- Create: `terraform/modules/golf-env/versions.tf`
- Create: `supabase/config.toml`

- [ ] **Step 1: Append Terraform ignores to `.gitignore`**

Add these lines to the end of `.gitignore`:
```gitignore
# Terraform
**/.terraform/*
*.tfstate
*.tfstate.*
crash.log
crash.*.log
*.tfvars.local
override.tf
override.tf.json
.terraformrc
terraform.rc
```

- [ ] **Step 2: Create `terraform/modules/golf-env/versions.tf`**

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
    github = {
      source  = "integrations/github"
      version = "~> 6.0"
    }
  }
}
```

- [ ] **Step 3: Create `supabase/config.toml`** (minimal — lets the Supabase CLI recognize this repo as a project for `db push`)

```toml
# Minimal Supabase CLI project config. The hosted project is provisioned by
# Terraform; this file just lets `supabase db push` find the migrations dir.
project_id = "golf-game"

[db]
major_version = 15
```

- [ ] **Step 4: Verify provider download + empty-module validate**

Run:
```bash
terraform -chdir=terraform/modules/golf-env init -backend=false -input=false
terraform -chdir=terraform/modules/golf-env validate
```
Expected: init succeeds (three providers installed); validate prints "Success! The configuration is valid." (a module with only `versions.tf` is valid).

- [ ] **Step 5: Commit**

```bash
git add .gitignore terraform/modules/golf-env/versions.tf supabase/config.toml
git commit -m "chore(tf): scaffold terraform module (providers, gitignore, supabase config)"
```

---

## Task 2: Module input variables

**Files:**
- Create: `terraform/modules/golf-env/variables.tf`

- [ ] **Step 1: Write `terraform/modules/golf-env/variables.tf`**

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
  description = "Supabase project region (e.g. us-east-1)."
  type        = string
}

variable "supabase_db_password" {
  description = "Postgres password for the new project. Supply via an HCP sensitive workspace variable (TF_VAR_supabase_db_password)."
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
  description = "Optional Google OAuth client secret; empty string uses Auth0 dev keys. Supply via an HCP sensitive variable."
  type        = string
  default     = ""
  sensitive   = true
}

# --- GitHub -----------------------------------------------------------------
variable "github_owner" {
  description = "GitHub repository owner/org."
  type        = string
}

variable "github_repository" {
  description = "GitHub repository name that consumes the VITE_* secrets."
  type        = string
}

variable "github_secret_environment" {
  description = "Empty string => write repo-level Actions secrets (prod). Non-empty => create that GitHub Environment and write its secrets (qa)."
  type        = string
  default     = ""
}

# --- Misc -------------------------------------------------------------------
variable "repo_root" {
  description = "Absolute path to the repository root (for migration files / supabase db push). Passed by the env wrapper as abspath(\"${path.root}/../../..\")."
  type        = string
}

variable "oidc_audience" {
  description = "Optional OIDC audience; empty string omits the VITE_OIDC_AUDIENCE secret."
  type        = string
  default     = ""
}
```

- [ ] **Step 2: fmt + validate**

Run:
```bash
terraform -chdir=terraform/modules/golf-env fmt
terraform -chdir=terraform/modules/golf-env validate
```
Expected: fmt prints any reformatted files (or nothing); validate prints "Success! The configuration is valid." (variables without values are fine for validate).

- [ ] **Step 3: Commit**

```bash
git add terraform/modules/golf-env/variables.tf
git commit -m "feat(tf): golf-env module input variables"
```

---

## Task 3: Module — Supabase project, keys, third-party auth, schema push

**Files:**
- Create: `terraform/modules/golf-env/main.tf`

- [ ] **Step 1: Write `terraform/modules/golf-env/main.tf`** (this task writes the Supabase section + the two local-exec steps; Auth0 and GitHub are appended in Tasks 4–5)

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
    # database_password is write-only; never destroy/recreate on drift here.
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
```

- [ ] **Step 2: fmt + validate**

Run:
```bash
terraform -chdir=terraform/modules/golf-env fmt
terraform -chdir=terraform/modules/golf-env validate
```
Expected: "Success! The configuration is valid." If validate complains about an unknown `supabase_project` argument or `supabase_apikeys` attribute, re-check against `terraform providers schema -json` for the installed `supabase/supabase` version and correct the names (the spec's research used: `organization_id`, `name`, `database_password`, `region`, `instance_size`, `legacy_api_keys_enabled` → `id`; data source `supabase_apikeys` arg `project_ref` → attrs `anon_key`, `service_role_key`).

- [ ] **Step 3: Commit**

```bash
git add terraform/modules/golf-env/main.tf
git commit -m "feat(tf): supabase project, api keys, third-party-auth + schema push"
```

---

## Task 4: Module — Auth0 SPA app + Google connection

**Files:**
- Modify: `terraform/modules/golf-env/main.tf` (append)

- [ ] **Step 1: Append the Auth0 section to `terraform/modules/golf-env/main.tf`**

```hcl
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

- [ ] **Step 2: fmt + validate**

Run:
```bash
terraform -chdir=terraform/modules/golf-env fmt
terraform -chdir=terraform/modules/golf-env validate
```
Expected: "Success! The configuration is valid." If validate flags `auth0_client` args (`callbacks`, `allowed_logout_urls`, `web_origins`, `app_type`, `grant_types`, `oidc_conformant`), the `options` block on `auth0_connection`, or `auth0_connection_clients` (`connection_id`, `enabled_clients`), reconcile against the installed `auth0/auth0` provider schema (`terraform providers schema -json`). Note: if the installed provider rejects a second `google-oauth2` connection per tenant, fall back to a single shared connection — see README "Auth0 multi-env note."

- [ ] **Step 3: Commit**

```bash
git add terraform/modules/golf-env/main.tf
git commit -m "feat(tf): auth0 SPA app + per-env google connection"
```

---

## Task 5: Module — GitHub Actions secrets + outputs

**Files:**
- Modify: `terraform/modules/golf-env/main.tf` (append)
- Create: `terraform/modules/golf-env/outputs.tf`

- [ ] **Step 1: Append the GitHub-secrets section to `terraform/modules/golf-env/main.tf`**

```hcl
# --- GitHub Actions secrets (VITE_* config baked into the build) ------------
locals {
  vite_secrets = merge(
    {
      VITE_SUPABASE_URL      = local.project_url
      VITE_SUPABASE_ANON_KEY = data.supabase_apikeys.this.anon_key
      VITE_OIDC_ISSUER       = local.issuer
      VITE_OIDC_CLIENT_ID    = auth0_client.spa.client_id
    },
    var.oidc_audience == "" ? {} : { VITE_OIDC_AUDIENCE = var.oidc_audience },
  )
  use_environment = var.github_secret_environment != ""
}

# Repo-level secrets (prod: consumed by the existing Pages deploy build).
resource "github_actions_secret" "repo" {
  for_each        = local.use_environment ? {} : local.vite_secrets
  repository      = var.github_repository
  secret_name     = each.key
  plaintext_value = each.value
}

# Environment-scoped secrets (qa: consumed by the future smoke-test job).
resource "github_repository_environment" "this" {
  count       = local.use_environment ? 1 : 0
  repository  = var.github_repository
  environment = var.github_secret_environment
}

resource "github_actions_environment_secret" "env" {
  for_each        = local.use_environment ? local.vite_secrets : {}
  repository      = var.github_repository
  environment     = github_repository_environment.this[0].environment
  secret_name     = each.key
  plaintext_value = each.value
}
```

- [ ] **Step 2: Create `terraform/modules/golf-env/outputs.tf`**

```hcl
output "project_ref" {
  description = "Supabase project reference id."
  value       = local.project_ref
}

output "project_url" {
  description = "Supabase project URL (VITE_SUPABASE_URL)."
  value       = local.project_url
}

output "anon_key" {
  description = "Supabase anon key (VITE_SUPABASE_ANON_KEY)."
  value       = data.supabase_apikeys.this.anon_key
  sensitive   = true
}

output "oidc_issuer" {
  description = "OIDC issuer (VITE_OIDC_ISSUER)."
  value       = local.issuer
}

output "oidc_client_id" {
  description = "Auth0 SPA client id (VITE_OIDC_CLIENT_ID)."
  value       = auth0_client.spa.client_id
}
```

- [ ] **Step 3: fmt + validate**

Run:
```bash
terraform -chdir=terraform/modules/golf-env fmt
terraform -chdir=terraform/modules/golf-env validate
```
Expected: "Success! The configuration is valid." If validate flags `github_actions_secret` / `github_repository_environment` / `github_actions_environment_secret` arguments, reconcile against the `integrations/github ~> 6.0` schema.

- [ ] **Step 4: Commit**

```bash
git add terraform/modules/golf-env/main.tf terraform/modules/golf-env/outputs.tf
git commit -m "feat(tf): github actions secrets (repo or environment scope) + outputs"
```

---

## Task 6: Environment wrappers (prod + qa)

**Files:**
- Create: `terraform/environments/prod/main.tf`, `terraform/environments/prod/terraform.tfvars`
- Create: `terraform/environments/qa/main.tf`, `terraform/environments/qa/terraform.tfvars`

- [ ] **Step 1: Create `terraform/environments/prod/main.tf`**

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    supabase = { source = "supabase/supabase", version = "~> 1.0" }
    auth0    = { source = "auth0/auth0", version = "~> 1.0" }
    github   = { source = "integrations/github", version = "~> 6.0" }
  }
  # HCP Terraform remote state. Set TF_CLOUD_ORGANIZATION in the environment so
  # the org isn't hard-coded. Workspace must use LOCAL execution mode.
  cloud {
    workspaces { name = "golf-prod" }
  }
}

# Providers read credentials from the environment:
#   supabase: SUPABASE_ACCESS_TOKEN
#   auth0:    AUTH0_DOMAIN / AUTH0_CLIENT_ID / AUTH0_CLIENT_SECRET
#   github:   GITHUB_TOKEN
provider "supabase" {}
provider "auth0" {}
provider "github" {
  owner = var.github_owner
}

variable "supabase_organization_id" { type = string }
variable "supabase_region" { type = string }
variable "supabase_db_password" {
  type      = string
  sensitive = true
}
variable "auth0_domain" { type = string }
variable "app_urls" { type = list(string) }
variable "github_owner" { type = string }
variable "github_repository" { type = string }
variable "oidc_audience" {
  type    = string
  default = ""
}

module "env" {
  source = "../../modules/golf-env"

  env                       = "prod"
  supabase_organization_id  = var.supabase_organization_id
  supabase_region           = var.supabase_region
  supabase_db_password      = var.supabase_db_password
  auth0_domain              = var.auth0_domain
  app_urls                  = var.app_urls
  github_owner              = var.github_owner
  github_repository         = var.github_repository
  github_secret_environment = "" # repo-level secrets → consumed by the deploy build
  oidc_audience             = var.oidc_audience
  repo_root                 = abspath("${path.root}/../../..")
}

output "project_url" { value = module.env.project_url }
output "oidc_issuer" { value = module.env.oidc_issuer }
output "oidc_client_id" { value = module.env.oidc_client_id }
```

- [ ] **Step 2: Create `terraform/environments/prod/terraform.tfvars`** (non-secret config only; the db password comes from an HCP sensitive workspace variable)

```hcl
supabase_organization_id = "REPLACE_WITH_SUPABASE_ORG_SLUG"
supabase_region          = "us-east-1"
auth0_domain             = "REPLACE_WITH_TENANT.us.auth0.com"
github_owner             = "ibuchan72390"
github_repository        = "golf-game"
app_urls = [
  "http://localhost:5173",
  "https://ibuchan72390.github.io/golf-game/",
]
```

- [ ] **Step 3: Create `terraform/environments/qa/main.tf`** (identical to prod except the workspace name, `env`, and `github_secret_environment`)

```hcl
terraform {
  required_version = ">= 1.6"
  required_providers {
    supabase = { source = "supabase/supabase", version = "~> 1.0" }
    auth0    = { source = "auth0/auth0", version = "~> 1.0" }
    github   = { source = "integrations/github", version = "~> 6.0" }
  }
  cloud {
    workspaces { name = "golf-qa" }
  }
}

provider "supabase" {}
provider "auth0" {}
provider "github" {
  owner = var.github_owner
}

variable "supabase_organization_id" { type = string }
variable "supabase_region" { type = string }
variable "supabase_db_password" {
  type      = string
  sensitive = true
}
variable "auth0_domain" { type = string }
variable "app_urls" { type = list(string) }
variable "github_owner" { type = string }
variable "github_repository" { type = string }
variable "oidc_audience" {
  type    = string
  default = ""
}

module "env" {
  source = "../../modules/golf-env"

  env                       = "qa"
  supabase_organization_id  = var.supabase_organization_id
  supabase_region           = var.supabase_region
  supabase_db_password      = var.supabase_db_password
  auth0_domain              = var.auth0_domain
  app_urls                  = var.app_urls
  github_owner              = var.github_owner
  github_repository         = var.github_repository
  github_secret_environment = "qa" # GitHub Environment "qa" → consumed by the smoke job
  oidc_audience             = var.oidc_audience
  repo_root                 = abspath("${path.root}/../../..")
}

output "project_url" { value = module.env.project_url }
output "oidc_issuer" { value = module.env.oidc_issuer }
output "oidc_client_id" { value = module.env.oidc_client_id }
```

- [ ] **Step 4: Create `terraform/environments/qa/terraform.tfvars`**

```hcl
supabase_organization_id = "REPLACE_WITH_SUPABASE_ORG_SLUG"
supabase_region          = "us-east-1"
auth0_domain             = "REPLACE_WITH_TENANT.us.auth0.com"
github_owner             = "ibuchan72390"
github_repository        = "golf-game"
# QA has no hosted frontend; localhost covers smoke-test/local builds pointed at QA.
app_urls = [
  "http://localhost:5173",
  "http://localhost:4173",
]
```

- [ ] **Step 5: fmt both envs + module-level validate (no cloud login needed)**

Run:
```bash
terraform -chdir=terraform/environments/prod fmt
terraform -chdir=terraform/environments/qa fmt
terraform -chdir=terraform/modules/golf-env validate
```
Expected: fmt clean; module validate "Success!". Do NOT run `terraform init`/`validate` inside the env dirs here — the `cloud {}` block would require HCP login. Env-level `init`/`validate`/`plan` is an operator step (documented in the README, Task 7) once credentials are staged.

- [ ] **Step 6: Commit**

```bash
git add terraform/environments
git commit -m "feat(tf): prod + qa environment wrappers (HCP workspaces, module calls)"
```

---

## Task 7: CI workflow + bootstrap README

**Files:**
- Create: `.github/workflows/terraform.yml`
- Create: `terraform/README.md`

- [ ] **Step 1: Create `.github/workflows/terraform.yml`** (credential-free static checks on changes under `terraform/`)

```yaml
name: Terraform

on:
  push:
    branches: [main]
    paths: ['terraform/**', '.github/workflows/terraform.yml']
  pull_request:
    paths: ['terraform/**', '.github/workflows/terraform.yml']

jobs:
  validate:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: hashicorp/setup-terraform@v3
        with:
          terraform_version: "1.9.8"
      - name: fmt
        run: terraform -chdir=terraform fmt -check -recursive
      - name: init + validate module (no backend, no credentials)
        run: |
          terraform -chdir=terraform/modules/golf-env init -backend=false -input=false
          terraform -chdir=terraform/modules/golf-env validate
```

- [ ] **Step 2: Create `terraform/README.md`**

````markdown
# Terraform — golf-game backend provisioning

Reusable `modules/golf-env` instantiated per environment (`environments/prod`,
`environments/qa`) on HCP Terraform. Provisions, per environment: a Supabase
project (+ third-party-auth trust of the Auth0 issuer + schema via
`supabase db push`), an Auth0 SPA app (+ Google login), and the `VITE_*` GitHub
Actions secrets (prod → repo secrets; qa → the `qa` GitHub Environment).

## One-time manual bootstrap (cannot be Terraformed — these ARE the credentials TF uses)

1. **HCP Terraform:** create an account/org; create workspaces `golf-prod` and
   `golf-qa` set to **Local** execution mode. Run `terraform login`.
2. **Supabase:** create a personal access token; note your org slug.
3. **Auth0:** create a Management API **M2M application** with management scopes
   (create/read clients, connections); note domain / client id / client secret.
4. **GitHub:** create a PAT with `repo` + secrets-admin scope.
5. Install the **Supabase CLI** and **Terraform ≥ 1.6** locally.

## Per-run environment variables (never commit these)

```bash
export TF_CLOUD_ORGANIZATION="<your-hcp-org>"
export SUPABASE_ACCESS_TOKEN="<supabase-pat>"
export AUTH0_DOMAIN="<tenant>.us.auth0.com"
export AUTH0_CLIENT_ID="<mgmt-m2m-client-id>"
export AUTH0_CLIENT_SECRET="<mgmt-m2m-client-secret>"
export GITHUB_TOKEN="<github-pat>"
export TF_VAR_supabase_db_password="<choose-a-strong-db-password>"
```

Set `TF_VAR_supabase_db_password` (and any Google OAuth secrets) as **sensitive
workspace variables in HCP** instead of locally for shared/CI-driven use.

## Fill in non-secret config

Edit `environments/<env>/terraform.tfvars`: `supabase_organization_id`,
`supabase_region`, `auth0_domain`, `app_urls` (replace the `REPLACE_WITH_*`
placeholders).

## Provision

```bash
cd terraform/environments/prod   # or qa
terraform init
terraform plan      # review
terraform apply     # creates project, registers third-party auth, pushes schema, seeds secrets
```

Then trigger a Pages deploy (push to `main` or re-run CI) — multiplayer goes
live. Tear down a throwaway env with `terraform destroy`.

## Notes
- **Schema** is owned by `supabase/migrations/` and applied by the `schema_push`
  step (`supabase db push`). If the CLI invocation needs adjustment on first run,
  the fallback is to run `supabase db push --db-url <conn>` manually from the repo
  root, or paste the migration SQL into the Supabase SQL editor.
- **Third-party auth** is registered via the Supabase Management API
  (`/v1/projects/{ref}/config/auth/third-party-auth`) by the `third_party_auth`
  step, since the provider doesn't model it.
- **Auth0 multi-env note:** each env creates its own `google-oauth2` connection
  (`golf-google-<env>`). If your Auth0 plan/provider rejects multiple connections
  of the same strategy, switch to a single shared connection enabled for both
  clients.
- **State** lives in HCP and contains secrets (db password, anon key) — that's
  why local/committed state is not used. Workspaces must be **Local execution**
  so the `local-exec` steps (Supabase CLI, curl) run on your machine.
````

- [ ] **Step 3: Lint the workflow YAML + confirm README renders**

Run:
```bash
terraform -chdir=terraform fmt -check -recursive
```
Expected: exit 0 (all files already formatted from prior tasks). Eyeball `terraform/README.md` for the placeholders being intentional (`REPLACE_WITH_*`, `<...>`) — these are operator-fill values, not plan placeholders.

- [ ] **Step 4: Commit**

```bash
git add .github/workflows/terraform.yml terraform/README.md
git commit -m "ci(tf): terraform fmt/validate workflow + bootstrap README"
```

---

## Task 8: Point the setup doc at the Terraform path

**Files:**
- Modify: `docs/multiplayer-setup.md`

- [ ] **Step 1: Add a Terraform section near the top of `docs/multiplayer-setup.md`**

Insert after the intro paragraph (after the line "Single-player needs no setup and CI passes without secrets."):

```markdown

## Provisioning the backend

Two paths:

- **Terraform (recommended, reproducible):** `terraform/` provisions the Supabase
  project, Auth0 app, schema, and GitHub `VITE_*` secrets for `prod` (and `qa`)
  from one reusable module. See [`terraform/README.md`](../terraform/README.md)
  for the one-time bootstrap + `terraform apply`. After `apply`, just trigger a
  deploy.
- **Manual (below):** create the Supabase + Auth0 projects by hand and
  `gh secret set` the values. Use this only if you're not using Terraform.
```

- [ ] **Step 2: fmt check (whole repo terraform unaffected) + commit**

Run:
```bash
terraform -chdir=terraform fmt -check -recursive
```
Expected: exit 0.

```bash
git add docs/multiplayer-setup.md
git commit -m "docs: point multiplayer setup at the Terraform provisioning path"
```

---

## Self-Review (completed during planning)

**Spec coverage:**
- §2 in-repo layout + reusable module + per-env HCP workspaces (local exec) → Tasks 1, 2–5 (module), 6 (envs), README (Task 7).
- §3.1 Supabase project + third-party auth + anon key → Task 3 (`supabase_project`, `supabase_apikeys`, Management-API `terraform_data`). Anon-key unknown resolved provider-native; third-party-auth unknown resolved via Management API (both confirmed against provider docs + Management API during planning).
- §3.2 Auth0 SPA + Google + URLs → Task 4.
- §3.3 GitHub secrets, repo vs environment scope → Task 5 (`github_secret_environment` switch).
- §3.4 schema via `supabase db push` → Task 3 (`schema_push`) + `supabase/config.toml` (Task 1).
- §4 credentials as env vars, sensitive in HCP, gitignore, no committed secrets → Task 1 (gitignore), Task 6 (tfvars hold only non-secret config), Task 7 (README bootstrap + env-var list).
- §5 static validation + CI without secrets → per-task module `validate`; Task 7 `terraform.yml`. Limitation (no apply/unit tests offline) stated in header.
- §6 operational flow → Task 7 README.
- §7 out-of-scope (smoke job, separate infra repo, DDL-in-TF, real Google creds) → correctly absent; Google creds are optional vars only.

**Placeholder scan:** No plan-failure placeholders. The `REPLACE_WITH_*` / `<...>` tokens in `terraform.tfvars` and the README are intentional operator-fill values (flagged as such in Task 7 Step 3), not unfinished plan content. The two "if validate flags X, reconcile against the provider schema" notes are concrete fallback instructions tied to the researched schema, not vague TODOs.

**Consistency:** Variable names match between module (`variables.tf`, Task 2), module usage (Tasks 3–5), and env wrappers (Task 6): `supabase_organization_id`, `supabase_region`, `supabase_db_password`, `auth0_domain`, `app_urls`, `github_owner`, `github_repository`, `github_secret_environment`, `oidc_audience`, `repo_root`. Local names (`local.project_ref`, `local.project_url`, `local.issuer`, `local.vite_secrets`, `local.use_environment`) are defined before use. Resource refs (`supabase_project.this.id`, `data.supabase_apikeys.this.anon_key`, `auth0_client.spa.client_id`, `auth0_connection.google.id`, `github_repository_environment.this[0]`) are consistent across tasks. Output names match what the env wrappers re-export.
