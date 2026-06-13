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
5. Install the **Supabase CLI** and **Terraform >= 1.6** locally.

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
