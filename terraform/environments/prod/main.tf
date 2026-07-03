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

module "env" {
  source = "../../modules/golf-env"

  env                      = "prod"
  supabase_organization_id = var.supabase_organization_id
  supabase_region          = var.supabase_region
  supabase_db_password     = var.supabase_db_password
  auth0_domain             = var.auth0_domain
  app_urls                 = var.app_urls
  repo_root                = abspath("${path.root}/../../..")
}

output "project_url" { value = module.env.project_url }
output "oidc_issuer" { value = module.env.oidc_issuer }
output "oidc_client_id" { value = module.env.oidc_client_id }
output "anon_key" {
  value     = module.env.anon_key
  sensitive = true
}
