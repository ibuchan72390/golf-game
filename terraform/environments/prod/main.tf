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
