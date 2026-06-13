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
