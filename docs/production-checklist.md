# Production checklist

## Supabase

- Create the production project.
- Enable/apply the migrations in numeric order.
- Keep `SUPABASE_SERVICE_ROLE_KEY` server-side only.
- Set `ENABLE_SUPABASE_PERSISTENCE=1` only after migrations are applied.
- Configure backups and point-in-time recovery appropriate to the project.
- Confirm RLS remains enabled on research tables.

## Search

The core GIS path works without AI. Broad conventional web discovery uses a normal search API. Configure `BRAVE_SEARCH_API_KEY` for ordinance discovery and for finding public GIS servers that ArcGIS Portal does not index well. No language-model API is required.

## Cloudflare

- Add the domain to Cloudflare and use the assigned Cloudflare nameservers at the registrar.
- Create a scoped API token for Worker deployment.
- Add `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` as GitHub Actions secrets.
- Add Supabase/search secrets with `wrangler secret put` or the Cloudflare dashboard, never in `wrangler.toml`.
- Configure a route/custom domain for the Worker.
- Add rate limiting/WAF rules for `/api/research*` and `/api/code-search` before opening the service publicly.

## GitHub

- Keep `main` protected after initial setup.
- Require CI before merges.
- Use the manual Cloudflare deployment workflow after secrets are configured.
- Review the live 20-state gauntlet artifact after changes to discovery/adapters.

## GIS/source operations

- Do not bypass link-only/restricted sources.
- Review newly discovered source terms before promoting them to the persistent registry.
- Treat GIS parcel boundaries as reference data unless the source expressly states otherwise.
- Recheck stale/aging sources and explicit amendment pages.
- Preserve raw responses and retrieval timestamps for reproducibility.

## Launch gate

A production release should not be represented as a legal zoning determination. The deterministic output is a source-backed research packet. Any legal/design conclusion remains subject to authoritative municipal confirmation and professional review.
