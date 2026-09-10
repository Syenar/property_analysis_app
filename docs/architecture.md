# Architecture

## Design principle

The website is a deterministic property/zoning research system, not an AI agent. AI may optionally consume the finished packet later, but address resolution, GIS discovery, parcel/zoning queries, indexing, provenance, and completeness assessment do not depend on an LLM.

## Request flow

```text
Property address
      |
      v
U.S. Census geocoder
      |
      +--> jurisdiction candidates
      |      incorporated place / township / Census place / mailing city
      v
Jurisdiction source registry
      |
      +--> known healthy source? ---- yes ----> query it
      |
      no
      |
      v
Deterministic discovery
  - ArcGIS Portal
  - conventional web search (optional)
  - ArcGIS REST directory enumeration
  - ArcGIS Hub / Web Map item resolution
  - WFS detection
  - sanctioned generic REST configs
      |
      v
Policy + authority + geographic-fit scoring
      |
      +--> restricted source -> link only / warning
      v
Parcel point-in-polygon query
      |
      v
Parcel geometry
      |
      v
Zoning polygon intersection
      |
      +--> zoning identifiers
      v
Ordinance discovery + document retrieval/indexing
              |
              v
Completeness / warnings / provenance
              |
              v
JSON + Markdown packet
              |
              +--> Supabase/PostGIS (optional persistence)
              +--> browser export
              +--> external human/AI interpretation (optional)
```

## Why adapters matter

The engine never assumes one municipality-specific endpoint. Each GIS adapter implements the same conceptual operations:

- inspect a candidate service;
- rank parcel/zoning layers;
- query a parcel using a point;
- query zoning using parcel geometry;
- return normalized features plus raw/source metadata.

New platforms can therefore be added without rewriting the research engine.

## Source discovery and selection

Discovery is intentionally layered:

1. reuse a known jurisdiction source when available;
2. search ArcGIS Portal;
3. use conventional web search to find public government GIS endpoints;
4. enumerate public ArcGIS REST directories;
5. resolve ArcGIS Hub/Open Data/Web Map items to backing REST services;
6. recognize WFS endpoints;
7. include explicitly configured sanctioned JSON REST APIs.

Candidates are scored deterministically. The engine distinguishes:

- **authority** — government/official source signals;
- **automation policy** — whether integration/retrieval is allowed;
- **data-quality limitations** — for example reference-only/not-survey-grade;
- **geographic fit** — ArcGIS WGS84 extents that do not contain the researched address can be rejected;
- **purpose fit** — parcel vs zoning layer names, fields, geometry and query capability.

A public endpoint that says integration requires permission is not automatically used.

## Persistence model

Supabase is optional for execution but required by the production stack.

PostGIS stores parcel and zoning geometry. Raw GIS responses and source snapshots are also preserved so a result can be audited or reprocessed later. The jurisdiction registry records last successful and failed runs independently from saved source configuration.

Indexed ordinance text is stored as legal sections with PostgreSQL `tsvector` search. Browser access goes through the server; security-definer RPC functions are restricted to the Supabase service role.

## Completeness model

The packet does not call partial research complete. Current deterministic weights are:

- geocoded jurisdiction: 15%
- parcel found: 30%
- zoning found: 30%
- ordinance source found: 20%
- usable ordinance text indexed: 5%

A PDF that was merely downloaded does not receive indexing credit.

## Production boundaries

### Cloudflare edge

Suitable for:

- UI/static assets;
- DNS/TLS/security;
- Census geocoding;
- ArcGIS/WFS/REST discovery and querying;
- HTML/text ordinance retrieval;
- streamed progress.

### Node document worker

Recommended for:

- `pdftotext` PDF extraction;
- future OCR fallback if explicitly added;
- large/binary document processing;
- other native dependencies.

### Supabase

Owns:

- research runs;
- jurisdiction registry;
- source metadata;
- immutable raw snapshots;
- parcel/zoning PostGIS geometry;
- indexed ordinance documents/sections;
- server-side full-text search.

## What the core deliberately does not do

- It does not make legal conclusions about whether a proposed use is permitted.
- It does not hallucinate missing dimensional standards.
- It does not silently scrape prohibited assessor vendors.
- It does not treat GIS polygons as surveys.
- It does not require ChatGPT, Claude, or another LLM to complete the research packet.

## v0.2 hardening

### Static GIS adapter

The long-tail adapter accepts direct GeoJSON/JSON downloads and optional zipped shapefile datasets. Shapefile decoding is handled by the generic `shpjs` decoder rather than jurisdiction-specific code. The adapter normalizes every dataset to the same feature interface used by ArcGIS/WFS and performs local point/polygon intersection checks.

### Source lifecycle and jurisdiction guards

Discovery now searches municipality, county and state parcel scopes separately. Source scoring recognizes explicit superseded/retired/archive language, distinguishes current/prior-year zoning snapshots from older year-stamped datasets, rejects obvious conflicting state-coded government hosts, and retains WGS84 ArcGIS extent filtering.

### Network safety

All shared outbound HTTP calls validate URL protocol/host and manually validate every redirect destination. Localhost, link-local/private literal IP ranges, metadata endpoints and credential-bearing URLs are rejected by default. A specifically configured backend hostname such as a local Supabase development host can be trusted without opening arbitrary private hosts.

### Public API boundary

Research and ordinance-search inputs are normalized and bounded before the engine runs. Cloudflare and the local development server emit restrictive content-security, referrer, permissions and MIME-sniffing headers.

### Search cost control

Conventional web discovery deliberately uses a compact set of broad queries per municipality/county/state scope rather than issuing a separate paid search for every supported GIS format. ArcGIS Portal remains an independent discovery channel.
