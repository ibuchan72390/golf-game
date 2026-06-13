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
  description = "Absolute path to the repository root (for migration files / supabase db push). Passed by the env wrapper as abspath of the repo root."
  type        = string
}

variable "oidc_audience" {
  description = "Optional OIDC audience; empty string omits the VITE_OIDC_AUDIENCE secret."
  type        = string
  default     = ""
}
