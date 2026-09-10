# Search and coverage model

The engine deliberately separates **adapter coverage** from **jurisdiction coverage**.

## Adapter coverage

Reusable code supports:

1. ArcGIS FeatureServer / MapServer
2. ArcGIS Portal item discovery
3. ArcGIS REST service-directory enumeration
4. ArcGIS Hub/Open Data/Web Map resolution
5. OGC Web Feature Service (WFS)
6. sanctioned declarative JSON REST APIs
7. static GeoJSON/JSON datasets
8. zipped shapefile datasets through optional `shpjs`

New municipalities should normally become data/registry entries, not new code.

## Discovery order

For a new address the engine:

1. resolves state/county/municipality with Census;
2. checks the persistent jurisdiction registry;
3. searches ArcGIS Portal;
4. when a conventional search provider is configured, searches municipality-specific GIS terms;
5. falls back to county parcel searches;
6. falls back to state parcel datasets;
7. recognizes ArcGIS REST directories, Hub items, WFS endpoints and static downloads;
8. scores candidates for source authority, jurisdiction match, lifecycle and freshness;
9. inspects service metadata and source restrictions before spatial queries.

Zoning is intentionally more conservative than parcel discovery: a county or state zoning layer is never assumed to supersede the actual municipal zoning authority merely because it is easier to query.

## Broad web search is non-AI

`BRAVE_SEARCH_API_KEY` enables conventional web-index discovery. It is not an AI dependency. If no search key is configured the engine still uses ArcGIS Portal and previously verified registry sources, but broad ordinance/source discovery will be less complete.

## Persistent learning without AI

Successful source configurations are written into `jurisdiction_sources` when Supabase persistence is enabled. Future searches for the same jurisdiction can skip discovery and directly test the known endpoints. Last-success/last-failure timestamps allow unhealthy sources to be rediscovered rather than trusted forever.

## What “complete” means

A complete source packet currently requires:

- successful geocode;
- parcel geometry;
- at least one zoning intersection;
- at least one ordinance/code source.

Downloaded but unindexed documents do not receive document-index completeness credit. Source limitations and stale-data warnings remain visible even when the packet is otherwise complete.
