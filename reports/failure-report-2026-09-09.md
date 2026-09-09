# Failure / partial-coverage report — 2026-09-09

This report records failures honestly rather than converting them into guessed zoning answers.

## Dover, Delaware — parcel source unresolved

- Address: 411 Legislative Ave, Dover, DE 19901
- Working: official City ArcGIS directory; queryable zoning MapServer.
- Missing: dependable parcel polygon endpoint.
- Next reusable fix: broaden discovery to county-level parcel sources and identify parcel services embedded in assessor/vendor viewers without scraping prohibited systems.

## Des Moines, Iowa — automated integration restricted

- Address: 1007 E Grand Ave, Des Moines, IA 50319
- Finding: City ArcGIS service metadata says: “All rights reserved. Please request permission to integrate in your applications.”
- Engine behavior: **link-only / do not automate**.
- Next action: locate a separately licensed/open City or Polk County dataset, or obtain permission. Do not bypass the restriction.

## Frankfort, Kentucky — parcel authority ambiguity

- Address: 700 Capital Ave, Frankfort, KY 40601
- Working: City zoning regulations/map/interactive zoning page.
- Missing: trusted Franklin County, Kentucky parcel endpoint.
- Failure mode: generic searches return similarly named Franklin/Frankfort jurisdictions in other states or City of Franklin, Kentucky.
- Implemented during hardening: ArcGIS Portal WGS84 extent validation now rejects candidates whose published extent does not contain the researched address. Source-owner validation remains useful for projected/unknown extents.

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
3. Static GeoJSON/shapefile download adapter.
4. ~~Explicit ArcGIS Portal spatial-jurisdiction validation.~~ **Implemented for published WGS84 extents; additional owner validation remains.**
5. ~~Freshness signal separate from authority scoring.~~ **Implemented; supersession/replacement detection remains.**
6. Continue policy-first handling: never scrape or query a source contrary to stated terms.
