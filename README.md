# Property / Zoning Research Engine

A deterministic, source-first research engine and web interface that turns a U.S. street address into a structured property/zoning research packet. The core workflow does **not** require AI.

The product is intentionally built as research infrastructure: find authoritative sources, retrieve machine-readable GIS data when permitted, preserve provenance, index ordinances, and expose exactly what was found or could not be verified.

## Core workflow

1. Geocode a U.S. address through the U.S. Census Geocoder.
2. Preserve multiple jurisdiction candidates (incorporated place, county subdivision/township, Census place, mailing city) instead of assuming the mailing city controls zoning.
3. Check a reusable jurisdiction/source registry.
4. Discover public parcel/zoning sources through:
   - ArcGIS Portal search
   - conventional web search when a Brave Search key is configured
   - public ArcGIS REST directory enumeration
   - ArcGIS Hub / Open Data / Web Map item resolution
   - OGC Web Feature Service (WFS) detection
   - declaratively configured sanctioned JSON REST APIs
5. Inspect GIS layers and score parcel/zoning candidates from names, geometry types, query capabilities, field schemas, source authority, and geographic extent.
6. Spatially query the parcel at the geocoded point.
7. Convert ArcGIS multipart polygons and holes to valid GeoJSON.
8. Use the parcel geometry to query/intersect zoning layers.
9. Extract zoning identifiers from zoning-like fields and use them to sharpen ordinance discovery.
10. Locate official zoning ordinances, codes, and amendment candidates through deterministic web search.
11. Apply source-policy and `robots.txt` rules before automated non-GIS retrieval.
12. Download and index safe HTML/text; Node workers can extract PDFs using `pdftotext`.
13. Preserve source URLs, retrieval dates, modification dates, authority/confidence evidence, limitations, raw responses, and immutable source snapshots.
14. Persist parcels/zoning as PostGIS geometry when Supabase persistence is explicitly enabled.
15. Produce JSON and Markdown research packets plus deterministic completeness/warning status.
16. Search indexed ordinance sections without AI through PostgreSQL full-text search.

## Website

`web/` contains a production-oriented research interface with:

- a single prominent property-address search
- real streamed research-stage progress (no simulated spinner workflow)
- property/jurisdiction summary
- parcel and zoning result cards
- source-confidence/provenance views
- first-class source-quality and survey/reference limitations
- explicit partial/failed states
- JSON and Markdown export/copy
- standalone indexed ordinance search when Supabase persistence is enabled
- responsive, accessible Material-inspired visual hierarchy with restrained color and spacing

Run it locally:

```bash
npm run dev
```

Then open `http://localhost:8787`.

## Architecture

- `src/geocoding` — U.S. Census geocoder and jurisdiction candidates
- `src/discovery` — ArcGIS Portal, ArcGIS REST directory, ArcGIS Hub item resolution, optional conventional web search
- `src/adapters` — ArcGIS REST, OGC WFS, and generic sanctioned JSON REST adapters
- `src/geometry` — deterministic geometry conversion/intersection helpers
- `src/registry` — jurisdiction/source registry and source-health timestamps
- `src/confidence` — deterministic source/layer authority scoring
- `src/policy` — automation restrictions, source limitations, and robots policy
- `src/ordinances` — deterministic ordinance/code discovery
- `src/documents` + `src/indexing` — safe retrieval, legal-section parsing, and indexing
- `src/storage` — Supabase REST persistence and server-side ordinance search
- `src/packets` — completeness assessment plus JSON/Markdown packets
- `supabase/migrations` — PostgreSQL/PostGIS schema, raw snapshots, full-text search, RPC hardening
- `cloudflare` — Cloudflare Worker/static-assets deployment
- `scripts/run-live-gauntlet.mjs` — 20-state live address harness and failure-report generator
- `reports/` — source-validation and failure reports from the current research pass

See [`docs/architecture.md`](docs/architecture.md) and [`docs/deployment.md`](docs/deployment.md).

## Quick start: command-line research

```bash
node scripts/research-address.mjs "200 E Colfax Ave, Denver, CO 80203"
```

No database is required to run the research engine. Persistence is deliberately opt-in:

```env
ENABLE_SUPABASE_PERSISTENCE=1
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The Supabase service-role key must stay server-side.

## Supabase / PostGIS

Apply these migrations **in order**:

1. `supabase/migrations/001_initial.sql`
2. `supabase/migrations/002_source_snapshots.sql`
3. `supabase/migrations/003_document_search_and_rpc_security.sql`

The schema stores parcel/zoning geometry in PostGIS, preserves raw source snapshots, and provides server-side full-text ordinance search. Security-definer RPC functions are executable only by `service_role`; they are explicitly revoked from browser roles.

## Cloudflare

Cloudflare can provide authoritative DNS/nameservers, TLS/security/CDN, static assets, and the fetch-based research API. The Worker implementation streams real progress events.

Deterministic PDF text extraction is intentionally Node-specific (`pdftotext`), so production should use either:

- Cloudflare for web/edge research + a Node document worker for PDFs, or
- a normal Node research service behind Cloudflare DNS/proxy.

The core engine itself is not locked to Cloudflare-specific APIs.

## Live coverage harness

The fixture contains 20 real public-building addresses across 20 U.S. states:

```bash
npm run test:live
```

The harness performs the real address → source discovery → parcel → zoning → ordinance flow and writes:

- `reports/live-gauntlet.json`
- `reports/live-gauntlet.md`
- `reports/live-gauntlet-failures.md`

The current build environment used to assemble this repository did not permit outbound DNS from Node, so the repository does **not** claim a fabricated 20/20 local end-to-end result. The included web-source validation report separately records live public-source research and the known failure classes.

## Verification

```bash
npm test
npm run check
```

The deterministic suite covers geocoding parsing, ArcGIS service/directory/Hub discovery, WFS, declarative REST, layer scoring, geometry, source-policy restrictions, source limitations, robots rules, packet completeness, source health, Supabase persistence controls, full-text ordinance search, and the end-to-end deterministic engine flow using fixtures.

## Important limitations

- No single public national parcel/zoning API exists. Coverage depends on fragmented local public data.
- A publicly reachable REST endpoint is not automatically licensed for integration. Source metadata and explicit policies can block automated use.
- Public GIS geometry is commonly reference-grade, not survey-grade. The packet preserves those limitations instead of hiding them.
- A successfully downloaded PDF is not counted as indexed ordinance evidence until usable text was actually extracted.
- GIS/assessor/zoning sources can disagree or be stale. The product preserves authority, freshness clues, and warnings rather than silently choosing an answer.
- Ordinance *interpretation* is deliberately outside the deterministic core. The output is designed for architects/planners/lawyers or optional external AI analysis later.
