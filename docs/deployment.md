# Deployment model

## Required stack

- **GitHub** — source control and CI.
- **Supabase** — PostgreSQL, PostGIS, research persistence, jurisdiction registry, source snapshots, and ordinance full-text search.
- **Cloudflare** — authoritative DNS/nameservers, TLS/security/CDN, static web assets, and optionally the fetch-based research API at the edge.

## Recommended production split

The deterministic HTTP/GIS discovery pipeline uses standard `fetch`, so it can run in Cloudflare Workers. The included Worker streams newline-delimited JSON progress events to the browser.

Binary PDF text extraction is intentionally isolated in `src/documents/pdf-node.mjs`. It invokes `pdftotext` and therefore belongs in a Node container/worker. A production deployment can use either:

1. **Cloudflare edge + Node document worker** — Cloudflare serves the UI and handles geocoding/GIS/HTML research; PDF jobs are routed to a Node service.
2. **Node research service behind Cloudflare** — Cloudflare remains DNS/TLS/security/CDN while a normal Node service runs the complete workflow.

The core is not dependent on Cloudflare-specific APIs, so the second arrangement is often the simplest initial production deployment.

## Supabase setup

Apply migrations in this exact order:

```text
supabase/migrations/001_initial.sql
supabase/migrations/002_source_snapshots.sql
supabase/migrations/003_document_search_and_rpc_security.sql
```

Migration 001 enables PostGIS and creates research/source/document tables plus geometry RPCs. Migration 002 adds immutable raw-source snapshots. Migration 003 adds full-text ordinance search and hardens all security-definer RPC functions so only `service_role` may execute them.

Server configuration:

```env
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_SERVICE_ROLE_KEY=<server-only-secret>
ENABLE_SUPABASE_PERSISTENCE=1
```

Do **not** expose `SUPABASE_SERVICE_ROLE_KEY` to browser JavaScript, Cloudflare static asset bindings, public build-time variables, or client-side framework prefixes.

Persistence is intentionally disabled unless `ENABLE_SUPABASE_PERSISTENCE=1`, even when credentials are present.

### Ordinance search

When persistence is enabled, the backend exposes indexed ordinance search through `/api/code-search`. The browser sends only the research-run ID and query to the server. The server invokes the Supabase `search_document_sections` RPC with the service role; the browser never receives elevated database credentials.

## Cloudflare configuration

The repository includes:

- `cloudflare/wrangler.toml`
- `cloudflare/worker.mjs`
- static assets from `web/`

Store secrets with Wrangler rather than committing them:

```bash
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put BRAVE_SEARCH_API_KEY
```

Set `ENABLE_SUPABASE_PERSISTENCE=1` only after all Supabase migrations are installed and secrets are configured.

### DNS

At the registrar, set the domain's authoritative nameservers to the values Cloudflare provides. In Cloudflare:

1. create the production DNS record for the deployed Worker/Pages/origin;
2. enable proxying where appropriate;
3. use Full (strict) TLS for an origin deployment;
4. configure rate limiting/bot protection for research endpoints;
5. do not cache personalized research/API responses.

## Conventional web search

ArcGIS Portal, public REST directories, and direct GIS APIs require no AI. To broaden deterministic discovery beyond ArcGIS indexing, set a conventional Brave Search API key:

```env
BRAVE_SEARCH_API_KEY=...
```

If absent, the engine still runs but loses general-web source discovery. It never substitutes an AI search model.

## Generic sanctioned REST sources

Documented non-ArcGIS JSON GIS APIs can be configured without municipality-specific engine hacks:

```env
GENERIC_REST_CONFIGS_JSON=[]
```

Only configure sources whose terms/license permit the intended automated use.

## GitHub CI

`.github/workflows/ci.yml` runs the deterministic test suite and syntax checks. A deployment workflow can be added after Cloudflare/Supabase repository secrets are configured.
