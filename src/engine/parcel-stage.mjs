import { esriGeometryToGeoJSON } from '../adapters/arcgis.mjs';
import { geoJSONToEsriGeometry } from '../geometry/geojson.mjs';
import { chooseNearbyParcel, featureProps, featureGeom, layerSourceUrl } from './research-helpers.mjs';

export async function findParcel({ engine, address, geocode, candidates, maxCandidates, inspect, warnings, provenance }) {
  for (const candidate of candidates.slice(0, maxCandidates)) {
    try {
      const inspectedResult = await inspect(candidate);
      if (!inspectedResult) continue;
      const { adapter, ...inspection } = inspectedResult;
      const ranked = adapter.rankLayers(inspection, 'parcel');
      for (const rank of ranked.slice(0, 4)) {
        if (rank.score < 28) continue;
        const result = await adapter.queryPoint(candidate.url, rank.layer.id, geocode.coordinates);
        let feature = result?.features?.[0] || null;
        let resolutionMethod = feature ? 'exact-point' : null;
        if (!feature && adapter === engine.arcgis && typeof adapter.queryNearby === 'function') {
          const nearby = await adapter.queryNearby(candidate.url, rank.layer.id, geocode.coordinates, { meters:45 });
          const selected = chooseNearbyParcel(nearby?.features || [], address, geocode.coordinates);
          feature = selected.feature;
          resolutionMethod = feature ? selected.reason : null;
          if (!feature && selected.reason === 'ambiguous') {
            const nearest = selected.nearestMeters == null ? 'unknown' : `${selected.nearestMeters.toFixed(1)}m`;
            warnings.push(`Nearby parcel lookup returned ${selected.count} candidates and could not match the input address confidently (best address score ${selected.bestAddressScore || 0}, nearest ${nearest}): ${candidate.url}/${rank.layer.id}`);
          }
        }
        if (!feature) continue;
        if (resolutionMethod !== 'exact-point') {
          const label = resolutionMethod === 'address-match' ? 'nearby address matching'
            : resolutionMethod === 'nearest-geometry' ? 'nearest parcel geometry' : 'a nearby search';
          warnings.push(`Parcel resolved using ${label} because the Census geocode did not fall inside a parcel polygon.`);
        }
        const geometry = esriGeometryToGeoJSON(featureGeom(feature));
        const parcel = {
          sourceUrl:layerSourceUrl(candidate, inspection, rank.layer.id),
          sourceTitle:candidate.title,
          platform:candidate.platform || 'arcgis',
          layerId:rank.layer.id,
          layerName:rank.layer.name,
          layerScore:rank.score,
          layerScoreReasons:rank.reasons,
          properties:featureProps(feature),
          geometry,
          esriGeometry:featureGeom(feature)?.rings ? featureGeom(feature) : geoJSONToEsriGeometry(geometry),
          rawFeature:feature,
          resolutionMethod:resolutionMethod || 'exact-point',
          sourceLimitations:inspection.sourceLimitations || [],
          sourceFreshness:candidate.freshness || null
        };
        provenance.push({
          kind:'parcel-gis', url:parcel.sourceUrl, retrievedAt:new Date().toISOString(),
          confidence:candidate.confidence, freshness:candidate.freshness || null, limitations:parcel.sourceLimitations
        });
        if (candidate.freshness?.status === 'stale-signal') {
          warnings.push(`Selected parcel source item metadata is ${candidate.freshness.ageDays} days old; verify that the underlying dataset is still current: ${candidate.url}`);
        }
        return { parcel, parcelSource:candidate };
      }
    } catch (error) {
      warnings.push(`Parcel candidate failed: ${candidate.url}: ${error.message}`);
    }
  }
  return { parcel:null, parcelSource:null };
}
