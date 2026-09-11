import { esriGeometryToGeoJSON } from '../adapters/arcgis.mjs';
import { geoJSONToEsriGeometry } from '../geometry/geojson.mjs';
import { chooseNearbyParcel, featureProps, featureGeom, layerSourceUrl, prioritizeRankedLayers } from './research-helpers.mjs';

export async function findParcel({ engine, address, geocode, candidates, maxCandidates, inspect, warnings, provenance }) {
  for (const candidate of candidates.slice(0, maxCandidates)) {
    try {
      const inspectedResult = await inspect(candidate);
      if (!inspectedResult) continue;
      const { adapter, ...inspection } = inspectedResult;
      const ranked = prioritizeRankedLayers(adapter.rankLayers(inspection, 'parcel'), candidate.parcelLayerIds || candidate.preferredLayerIds);
      for (const rank of ranked.slice(0, 4)) {
        if (rank.score < 28) continue;
        const result = await adapter.queryPoint(candidate.url, rank.layer.id, geocode.coordinates);
        const pointFeatures = result?.features || [];
        let feature = null;
        let resolutionMethod = null;
        let matchEvidence = null;
        if (pointFeatures.length === 1) {
          feature = pointFeatures[0];
          resolutionMethod = 'exact-point';
          matchEvidence = {
            status:'high', insideParcel:true, candidateCount:1, distanceMeters:0,
            addressScore:null, runnerUpAddressScore:null, nearestAlternativeMeters:null,
            searchRadiusMeters:0
          };
        } else if (pointFeatures.length > 1) {
          const selected = chooseNearbyParcel(pointFeatures, address, geocode.coordinates, { allowNearest:false });
          feature = selected.feature;
          if (feature) {
            resolutionMethod = 'exact-point-address-match';
            matchEvidence = {
              status:'review', insideParcel:true, candidateCount:selected.candidateCount,
              distanceMeters:0, addressScore:selected.addressScore ?? selected.score ?? null,
              runnerUpAddressScore:selected.runnerUpAddressScore ?? null,
              nearestAlternativeMeters:selected.nearestAlternativeMeters ?? null,
              searchRadiusMeters:0
            };
            warnings.push(`Parcel match requires review: ${selected.candidateCount} parcel polygons intersect the Census address point. The parcel whose source address fields best matched the input address was selected. Verify the parcel identifier and source record before relying on zoning results.`);
          } else {
            warnings.push(`Parcel point lookup is ambiguous: ${selected.candidateCount || pointFeatures.length} parcel polygons intersect the Census address point and the source attributes did not identify one parcel confidently: ${candidate.url}/${rank.layer.id}`);
          }
        }
        if (!feature && pointFeatures.length === 0 && adapter === engine.arcgis && typeof adapter.queryNearby === 'function') {
          const nearby = await adapter.queryNearby(candidate.url, rank.layer.id, geocode.coordinates, { meters:45 });
          const selected = chooseNearbyParcel(nearby?.features || [], address, geocode.coordinates);
          feature = selected.feature;
          resolutionMethod = feature ? selected.reason : null;
          if (feature) {
            matchEvidence = {
              status:'review', insideParcel:false, candidateCount:selected.candidateCount || 1,
              distanceMeters:selected.distanceMeters ?? null,
              addressScore:selected.addressScore ?? selected.score ?? null,
              runnerUpAddressScore:selected.runnerUpAddressScore ?? null,
              nearestAlternativeMeters:selected.nearestAlternativeMeters ?? null,
              searchRadiusMeters:45
            };
          } else if (selected.reason === 'ambiguous') {
            const nearest = selected.nearestMeters == null ? 'unknown' : `${selected.nearestMeters.toFixed(1)} m`;
            warnings.push(`Nearby parcel lookup returned ${selected.candidateCount || selected.count} candidates and could not match the input address confidently (best address score ${selected.bestAddressScore || 0}, nearest boundary ${nearest}): ${candidate.url}/${rank.layer.id}`);
          }
        }
        if (!feature) continue;
        if (matchEvidence && matchEvidence.insideParcel === false) {
          const distance = Number.isFinite(matchEvidence.distanceMeters) ? `${matchEvidence.distanceMeters.toFixed(1)} m` : 'an unknown distance';
          const count = matchEvidence.candidateCount || 1;
          if (resolutionMethod === 'address-match') {
            warnings.push(`Parcel match requires review: the Census address point did not fall inside a parcel polygon. The parcel whose source address fields best matched the input was selected from ${count} nearby candidate${count === 1 ? '' : 's'}; the point is approximately ${distance} from the selected parcel boundary. Verify the parcel identifier/address before relying on zoning or property results.`);
          } else if (resolutionMethod === 'nearest-geometry') {
            warnings.push(`Parcel match requires review: the Census address point did not fall inside a parcel polygon. The nearest parcel was selected from ${count} nearby candidates; the point is approximately ${distance} from the selected parcel boundary. Verify the parcel identifier/address before relying on zoning or property results.`);
          } else {
            warnings.push(`Parcel match requires review: the Census address point did not fall inside a parcel polygon. The only nearby parcel candidate was selected; the point is approximately ${distance} from the parcel boundary. Verify the parcel identifier/address before relying on zoning or property results.`);
          }
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
          matchEvidence,
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
