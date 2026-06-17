# Terraform — golf-game backend provisioning

Reusable `modules/golf-env` instantiated per environment (`environments/prod`,
`environments/qa`) on HCP Terraform. Provisions, per environment: a Supabase
project (+ third-party-auth trust of the Auth0 issuer + schema via
`supabase db push`) and an Auth0 SPA app (+ Google login). The public `VITE_*`
build values are delivered separately as GitHub repository Variables (see below).

## Pipeline-driven provisioning (primary)

Terraform runs in GitHub Actions, not locally. Bootstrap once, then it's automated.

### One-time bootstrap
1. **HCP Terraform:** org `ibuchan-org`; workspaces `golf-prod` and `golf-qa`, both **Local execution**. (State only; the GitHub runner executes.)
2. **Auth0:** create a Management-API **M2M app in each tenant** (`ian-golf-game-prod`, `ian-golf-game-qa`) with scopes `create:clients read:clients update:clients create:connections read:connections update:connections`.
3. **Supabase:** a personal access token.
4. **GitHub Environments + secrets:** create the `prod` (required reviewer = you) and `qa` environments, then set the env-scoped secrets in each:
   `TF_API_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `AUTH0_DOMAIN`, `AUTH0_CLIENT_ID`, `AUTH0_CLIENT_SECRET`, `SUPABASE_DB_PASSWORD`.
   (`TF_API_TOKEN` + `SUPABASE_ACCESS_TOKEN` are the same value in both; the Auth0 trio + db password differ per environment.) The `seed-secrets.sh` helper at the repo root does this.

### Provision
- **PR** touching `terraform/**` → `fmt` + `validate` + **Checkov** + a speculative **qa plan** posted as a PR comment (your review artifact).
- **Merge to `main`** → **qa applies automatically**, then **prod waits on your approval** (the `prod` environment gate). Approve it in the Actions run.
- `workflow_dispatch` (Actions tab → Terraform → Run workflow → pick `qa`/`prod`) re-applies a single environment without a new commit (useful for first-run shakeout).

### App config (`VITE_*`) — set once, by hand, from outputs
`VITE_*` are **public** values, so they are GitHub repository **Variables**, not secrets, and Terraform does not write them. After the first prod apply, read the outputs and set the Variables once:
```bash
cd terraform/environments/prod
gh variable set VITE_SUPABASE_URL      --body "$(terraform output -raw project_url)"
gh variable set VITE_SUPABASE_ANON_KEY --body "$(terraform output -raw anon_key)"
gh variable set VITE_OIDC_ISSUER       --body "$(terraform output -raw oidc_issuer)"
gh variable set VITE_OIDC_CLIENT_ID    --body "$(terraform output -raw oidc_client_id)"
```
Then trigger the app deploy (Actions → CI → Run workflow, or push) so the build bakes them in. They change only if the project/app is recreated.

## Notes
- **Schema** is owned by `supabase/migrations/`, applied by the `schema_push` step (`supabase db push`) in the runner.
- **Third-party auth** is registered via the Supabase Management API by the `third_party_auth` step (the provider doesn't model it).
- **Auth0:** each env is its own tenant with its own M2M app; the apply job uses that environment's `AUTH0_*` secrets. Each env also creates its own `google-oauth2` connection (`golf-google-<env>`).
- **State** is in HCP (Local execution) and contains secrets — never committed.
