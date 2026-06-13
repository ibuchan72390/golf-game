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
