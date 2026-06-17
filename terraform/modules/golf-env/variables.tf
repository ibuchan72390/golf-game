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
