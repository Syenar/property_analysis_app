# Failure / partial-coverage report — 2026-09-09

This report records failures honestly rather than converting them into guessed zoning answers.

## Dover, Delaware — resolved by county fallback

- Address: 411 Legislative Ave, Dover, DE 19901
- Resolved parcel source: `https://gis.kentcountyde.gov/server/rest/services/Parcels/Parcels/FeatureServer`
- Zoning source: City of Dover queryable zoning MapServer.
- Reusable fix implemented: municipality → county fallback searches plus ArcGIS REST-directory discovery.

## Des Moines, Iowa — automated integration restricted

- Address: 1007 E Grand Ave, Des Moines, IA 50319
- Finding: City ArcGIS service metadata says: “All rights reserved. Please request permission to integrate in your applications.”
- Engine behavior: **link-only / do not automate**.
- Next action: locate a separately licensed/open City or Polk County dataset, or obtain permission. Do not bypass the restriction.

## Frankfort, Kentucky — resolved through officially linked county portal

- Address: 700 Capital Ave, Frankfort, KY 40601
- Official Franklin County site links the County Wide Mapping portal.
- Backing service: `https://www.franklincountymaps.net/arcgis/rest/services/Hosted/Planning_WFL1/MapServer`
- Layers include Parcels (15) and Zoning (16).
- Reusable safeguards retained: state-host evidence and geographic-extent filtering prevent same-name out-of-state candidates from outranking relevant sources.

## Augusta, Maine — static/interactive source long tail

- Address: 210 State St, Augusta, ME 04330
- Working: official City assessment map, PDF property tax maps and zoning maps.
- Missing: pinned queryable parcel/zoning API.
- Next reusable fix: add sanctioned static GeoJSON/shapefile/ArcGIS Hub download adapter and identify the backing platform of the interactive map.

## Annapolis, Maryland — downloadable data, current zoning endpoint not pinned

- Address: 100 State Cir, Annapolis, MD 21401
- Working: official City parcel/zoning downloads, interactive zoning map, zoning PDFs.
- Missing: deterministic current zoning REST service resolution.
- Important source limitation: City says map material is for reference purposes only, while also allowing copying as public-domain material.
- Implemented during hardening: ArcGIS Hub/Open Data/Web Map item resolver now follows ArcGIS item IDs to backing FeatureServer/MapServer URLs. This address remains PARTIAL in the dated validation because the exact official current item still needs to be discovered/pinned by a networked run.

## Lansing, Michigan — freshness/authority ambiguity

- Address: 100 N Capitol Ave, Lansing, MI 48933
- Working: parcel candidates and historic City open-data zoning datasets exist.
- Missing: confidently current City zoning source with clear authority/licensing.
- Implemented during hardening: source modified dates are now classified separately as recent/aging/stale-signal and surfaced without changing authority. Source-owner validation and explicit supersession/replacement detection remain open.

## Cross-cutting fixes prioritized

1. County-level fallback discovery when city parcel services are absent.
2. ~~ArcGIS Hub/Open Data item resolver.~~ **Implemented.**
3. ~~Static GeoJSON/shapefile download adapter.~~ **Implemented (GeoJSON directly; zipped shapefile through optional `shpjs`).**
4. ~~Explicit ArcGIS Portal spatial-jurisdiction validation.~~ **Implemented for published WGS84 extents plus state-coded government-host conflict checks; generic ArcGIS-host owner verification remains an improvement area.**
5. ~~Freshness signal separate from authority scoring.~~ **Implemented, including explicit supersession/retirement detection and age-aware year-stamped zoning handling.**
6. Continue policy-first handling: never scrape or query a source contrary to stated terms.

## Remaining long-tail work after v0.2 hardening

- Augusta, Maine: official interactive/static mapping exists, but no dependable queryable current parcel + zoning vector endpoint has yet been pinned.
- Annapolis, Maryland: official parcels are queryable and public-domain/reference-only; the obvious COA zoning service identifies itself as a 2016 layer, so current zoning must continue to be verified against the City’s current zoning maps rather than silently treated as current.
- Lansing, Michigan: current county parcel data is available, but the engine should not promote an ambiguous City zoning service until current authority/source ownership is verified.
- Des Moines, Iowa: machine-readable city services that were found explicitly request integration permission and remain link-only.
