# Engineering rules

- Core research must not require AI/LLMs.
- Prefer official government APIs, ArcGIS REST, standards-based GIS feeds, and official downloadable data.
- Never automate a source explicitly marked deny/link-only by SourcePolicy.
- Preserve raw responses, source URLs, retrieval timestamps, and source-confidence evidence.
- Build reusable platform adapters. Do not add municipality-specific scraping hacks to core adapters.
- Unknown third-party portals are link-only until their automation terms are reviewed.
- Keep server-only secrets out of client code.
- Every adapter change needs deterministic fixture tests.
