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
