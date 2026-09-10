# 20-state public-source validation

Generated: 2026-09-09

## Scope and honesty note

This is a **live public-source validation**, not a claim that all 20 addresses completed an end-to-end run inside the build container. The container used for automated tests has outbound DNS/network access disabled. I therefore validated the actual public GIS/source infrastructure through web access and kept the executable 20-address harness in `scripts/run-live-gauntlet.mjs` for a normal network-enabled Node environment.

Status meanings:

- **READY** — an official/queryable parcel source and an official/queryable zoning source were identified, or one official service exposes both.
- **PARTIAL** — authoritative public sources exist, but at least one required machine-readable source is not yet pinned to a dependable adapter/endpoint.
- **RESTRICTED** — the apparent machine-readable source explicitly requires permission or otherwise blocks automated integration.

Summary after the hardening pass: **16 READY / 3 PARTIAL / 1 RESTRICTED**.

| State | Validation address | Status | Parcel source | Zoning source | Notes |
|---|---|---|---|---|---|
| AL | 600 Dexter Ave, Montgomery, AL 36130 | READY | https://gis.montgomeryal.gov/server/rest/services/Parcels/FeatureServer | https://gis.montgomeryal.gov/server/rest/services/Zoning/FeatureServer | Official city FeatureServers; both queryable. |
| AZ | 1700 W Washington St, Phoenix, AZ 85007 | READY | https://maps.phoenix.gov/pub/rest/services/public/CityParcels/MapServer | https://maps.phoenix.gov/pub/rest/services/public/AllZoning/MapServer | Parcel service says viewing/label purposes only and is not a survey source; limitation must be surfaced. |
| AR | 500 Woodlane St, Little Rock, AR 72201 | READY | https://maps.littlerock.gov/server/rest/services/Tax_Parcel_Boundary/MapServer | https://maps.littlerock.gov/server/rest/services/Zoning_Only/MapServer | Official city ArcGIS services; zoning includes existing zoning and design overlays. |
| CA | 1315 10th St, Sacramento, CA 95814 | READY | https://mapservices.gis.saccounty.gov/arcgis/rest/services/PARCELS/MapServer | https://mapservices.gis.saccounty.gov/arcgis/rest/services/CITY_of_SACRAMENTO/MapServer | County parcels plus City of Sacramento zoning layer. |
| CO | 200 E Colfax Ave, Denver, CO 80203 | READY | https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_PROP_PARCELS_A/FeatureServer | https://services1.arcgis.com/zdB7qR0BtYrg0Xpl/arcgis/rest/services/ODC_ZONE_ZONING_A/FeatureServer | Official Denver data; parcel geometry explicitly says not survey quality/general reference only. |
| CT | 210 Capitol Ave, Hartford, CT 06106 | READY | https://gis.hartford.gov/arcgis/rest/services/AccelaPROD/MapServer | https://gis.hartford.gov/arcgis/rest/services/AccelaPROD/MapServer | One official service exposes parcels, zoning, zoning overlays and flood zones. |
| DE | 411 Legislative Ave, Dover, DE 19901 | READY | https://gis.kentcountyde.gov/server/rest/services/Parcels/Parcels/FeatureServer | https://gis.dover.de.us/arcgis/rest/services/Zoning/MapServer | County fallback found an official queryable parcel polygon FeatureServer; City zoning remains the zoning authority. |
| FL | 400 S Monroe St, Tallahassee, FL 32399 | READY | https://intervector.leoncountyfl.gov/intervector/rest/services/MapServices/TLC_OverlayParNALPublic_D_WM/MapServer | https://intervector.leoncountyfl.gov/intervector/rest/services/MapServices/TLC_OverlayZoningLandUse_D_WM/MapServer | Tallahassee-Leon County GIS; parcel layer exposes TaxID, acreage and public parcel attributes. |
| GA | 206 Washington St SW, Atlanta, GA 30334 | READY | https://gis.atlantaga.gov/dpcd/rest/services/LandUsePlanning/LotsWithZoning/MapServer | https://gis.atlantaga.gov/dpcd/rest/services/LandUsePlanning/LandUsePlanning/MapServer | City planning ArcGIS includes cadastral lots with zoning plus zoning district/overlay layers. |
| ID | 700 W Jefferson St, Boise, ID 83702 | READY | https://gismap.cityofboise.org/arcgis/rest/services/BoiseMaps/DBA/MapServer | https://gismap.cityofboise.org/arcgis/rest/services/BoiseMaps/DBA/MapServer | City of Boise Geocortex configuration exposes Parcels (layer 5), overlays and Boise Zoning (layer 24) on the underlying ArcGIS service. |
| IL | 401 S 2nd St, Springfield, IL 62701 | READY | https://maps.springfield.il.us/server/rest/services/PW_Zoning/parcelZonesView/MapServer | https://maps.springfield.il.us/server/rest/services/PW_Zoning/parcelZonesView/MapServer | Same service has zoning polygons and parcel polygons. |
| IN | 200 W Washington St, Indianapolis, IN 46204 | READY | https://gis.indy.gov/server/rest/services/Common/CommonlyUsedLayers/MapServer | https://gis.indy.gov/server/rest/services/MapIndy/Zoning/MapServer | Official Indianapolis/Marion County services; zoning service also exposes variances, legal nonconforming uses, approvals and flood zones. |
| IA | 1007 E Grand Ave, Des Moines, IA 50319 | RESTRICTED | Candidate services exist | https://maps.dsm.city/p2/rest/services/External/EXTDynamicShowMeMyHouse/MapServer | Service metadata says all rights reserved and requests permission to integrate in applications. Engine must not automate it without permission; retired zoning service carries the same restriction. |
| KS | 300 SW 10th Ave, Topeka, KS 66612 | READY | https://maps.topeka.gov/arcgis/rest/services/ParcelPublishing/Parcels_and_Subdivisions/FeatureServer | https://maps.topeka.gov/arcgis/rest/services/LandUsePlanning/ZoningDistrict/FeatureServer | Official City of Topeka parcel and zoning FeatureServers. |
| KY | 700 Capital Ave, Frankfort, KY 40601 | READY | https://www.franklincountymaps.net/arcgis/rest/services/Hosted/Planning_WFL1/MapServer | https://www.franklincountymaps.net/arcgis/rest/services/Hosted/Planning_WFL1/MapServer | Franklin County’s official site links its county-wide mapping portal; the backing queryable service exposes Parcels (15) and Zoning (16). |
| LA | 900 N 3rd St, Baton Rouge, LA 70802 | READY | https://maps.brla.gov/gis/rest/services/Cadastral/Tax_Parcel/MapServer | https://maps.brla.gov/gis/rest/services/Cadastral/Zoning/MapServer | Official City-Parish/assessor GIS; parcel metadata says updated annually. |
| ME | 210 State St, Augusta, ME 04330 | PARTIAL | https://www.augustamaine.gov/property-tax-maps | https://www.augustamaine.gov/property-tax-maps | Official city provides interactive assessment map and PDF tax/zoning maps, but a current queryable parcel/zoning endpoint was not pinned. Needs a sanctioned static-map/vendor adapter. |
| MD | 100 State Cir, Annapolis, MD 21401 | PARTIAL | Official downloadable Parcel Polygons: https://www.annapolis.gov/246/GIS-Data-Downloads | Official downloadable Zoning + interactive map: https://www.annapolis.gov/547/Zoning-Maps | Strong public data and GeoJSON downloads, but current zoning REST endpoint still needs to be pinned automatically. City explicitly calls zoning material reference-only/public-domain. |
| MA | 24 Beacon St, Boston, MA 02133 | READY | https://gis.boston.gov/arcgis/rest/services/Parcels/Parcels_current/FeatureServer | https://gis.bostonplans.org/hosting/rest/services/Zoning_Districts/FeatureServer | Current parcel geometry plus zoning district service; zoning fields include district/article/map references. |
| MI | 100 N Capitol Ave, Lansing, MI 48933 | PARTIAL | Current Ingham County parcel services are discoverable | City zoning candidates exist but current authority/licensing is not pinned | Historic Lansing open-data zoning/parcel datasets are discoverable, but source age/license ambiguity makes automatic current zoning selection unsafe. Needs source-owner/freshness validation. |

## Findings that changed the implementation

1. ArcGIS Portal search alone is insufficient. Many government ArcGIS Server directories are public but poorly indexed, so the engine now crawls discovered REST directories deterministically.
2. A public REST endpoint is not automatically safe to integrate. Service metadata is inspected for permission/license restrictions before queries are made.
3. Data can be legal to retrieve but unsuitable for survey/legal reliance. Those limitations are preserved separately from automation policy.
4. Some official data pages expose an ArcGIS Hub/Web Map item rather than the backing service. The engine now resolves recognizable ArcGIS item IDs and recursively finds backing FeatureServer/MapServer URLs.
5. Some jurisdictions publish standards-based or downloadable data rather than ArcGIS. The engine now supports WFS, declarative sanctioned JSON REST APIs, direct GeoJSON downloads, and optional zipped shapefile decoding.
6. Mailing city cannot be treated as the zoning authority. Census incorporated-place/county-subdivision candidates are kept separately.
7. Item modification age is now tracked as a separate freshness signal (recent/aging/stale-signal) instead of being conflated with source authority. Explicit supersession/retirement signals and older year-stamped zoning snapshots are separately down-ranked.

## Remaining failure classes

See `reports/failure-report-2026-09-09.md` for the actionable engineering backlog created from this validation.

## Hardening added after validation

- Municipality → county → state parcel discovery scopes, with state scope limited to parcel-oriented fallbacks.
- Static GeoJSON and optional zipped shapefile adapters.
- Explicit superseded/historical dataset rejection and recent year-stamped zoning handling.
- State-coded government-host checks to reject obvious wrong-state candidates.
- Safe outbound URL/redirect validation to block local/private literal network targets.
- GitHub Actions workflow for the executable 20-state networked gauntlet.
