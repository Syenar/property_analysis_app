import { esriGeometryToGeoJSON } from '../adapters/arcgis.mjs';
import { layerSourceUrl, prioritizeRankedLayers } from './research-helpers.mjs';

export async function findZoning({ engine, parcel, candidates, maxCandidates, inspect, warnings, provenance }) {
  const zoning = [];
  if (!parcel?.geometry) return zoning;
  for (const candidate of candidates.slice(0, maxCandidates)) {
    try {
      const inspectedResult = await inspect(candidate);
      if (!inspectedResult) continue;
      const { adapter, ...inspection } = inspectedResult;
      const ranked = prioritizeRankedLayers(adapter.rankLayers(inspection, 'zoning'), candidate.zoningLayerIds || candidate.preferredLayerIds);
      for (const rank of ranked.slice(0, 4)) {
        if (rank.score < 35) continue;
        const queryGeometry = adapter === engine.arcgis ? parcel.esriGeometry : parcel.geometry;
        const result = await adapter.queryGeometry(candidate.url, rank.layer.id, queryGeometry, { inSR:4326 });
        if (!result?.features?.length) continue;
        const sourceUrl = layerSourceUrl(candidate, inspection, rank.layer.id);
        zoning.push({
          sourceUrl,
          sourceTitle:candidate.title,
          platform:candidate.platform || 'arcgis',
          layerId:rank.layer.id,
          layerName:rank.layer.name,
          layerScore:rank.score,
          layerScoreReasons:rank.reasons,
          sourceLimitations:inspection.sourceLimitations || [],
          sourceFreshness:candidate.freshness || null,
          features:result.features.map((feature) => ({
            ...feature,
            esriGeometry:feature.geometry || null,
            geometry:esriGeometryToGeoJSON(feature.geometry)
          }))
        });
        provenance.push({
          kind:'zoning-gis', url:sourceUrl, retrievedAt:new Date().toISOString(),
          confidence:candidate.confidence, freshness:candidate.freshness || null,
          limitations:inspection.sourceLimitations || []
        });
        if (candidate.freshness?.status === 'stale-signal') {
          warnings.push(`Selected zoning source item metadata is ${candidate.freshness.ageDays} days old; verify that the underlying dataset is still current: ${candidate.url}`);
        }
        break;
      }
    } catch (error) {
      warnings.push(`Zoning candidate failed: ${candidate.url}: ${error.message}`);
    }
    if (zoning.length >= 3) break;
  }
  return zoning;
}
