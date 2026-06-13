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
  github_repository         = var.github_repository
  github_secret_environment = "qa" # GitHub Environment "qa" → consumed by the smoke job
  oidc_audience             = var.oidc_audience
  repo_root                 = abspath("${path.root}/../../..")
}

output "project_url" { value = module.env.project_url }
output "oidc_issuer" { value = module.env.oidc_issuer }
output "oidc_client_id" { value = module.env.oidc_client_id }
