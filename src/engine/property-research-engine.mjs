import { buildResearchPacket, packetToMarkdown } from '../packets/research-packet.mjs';
import { esriGeometryToGeoJSON } from '../adapters/arcgis.mjs';
import { geoJSONToEsriGeometry } from '../geometry/geojson.mjs';
import { zoningIdentifiers } from '../indexing/text-index.mjs';
import { sourceLifecycle } from '../confidence/scoring.mjs';

function featureProps(f) { return f?.properties || f?.attributes || {}; }
function featureGeom(f) { return f?.geometry || null; }

function normalizeAddressText(value) {
  return String(value || '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\b(street|st|avenue|ave|road|rd|boulevard|blvd|drive|dr|lane|ln|court|ct|place|pl|highway|hwy|north|south|east|west|n|s|e|w)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

function parcelAddressScore(feature, inputAddress) {
  const props = featureProps(feature);
  const input = normalizeAddressText(inputAddress);
  const inputTokens = new Set(input.split(' ').filter((x) => x.length > 1));
  const house = input.match(/^\d+[a-z]?\b/)?.[0] || null;
  let best = 0;
  for (const [key, value] of Object.entries(props)) {
    if (!/(address|addr|situs|site|location|street|premise|property)/i.test(key) || value == null) continue;
    const text = normalizeAddressText(value);
    if (!text) continue;
    let score = 0;
    if (house && new RegExp(`^${house}\\b`).test(text)) score += 8;
    const tokens = new Set(text.split(' ').filter((x) => x.length > 1));
    for (const token of inputTokens) if (tokens.has(token)) score += 1;
    best = Math.max(best, score);
  }
  return best;
}

function chooseNearbyParcel(features, inputAddress) {
  if (!features?.length) return { feature:null, reason:'none' };
  if (features.length === 1) return { feature:features[0], reason:'single-nearby' };
  const ranked = features.map((feature) => ({ feature, score:parcelAddressScore(feature, inputAddress) })).sort((a,b) => b.score - a.score);
  if (ranked[0].score >= 5 && ranked[0].score >= (ranked[1]?.score || 0) + 2) return { feature:ranked[0].feature, reason:'address-match', score:ranked[0].score };
  return { feature:null, reason:'ambiguous', count:features.length };
}

function layerSourceUrl(candidate, inspection, layerId) {
  if (candidate?.platform === 'wfs') return `${candidate.url}#typeName=${encodeURIComponent(layerId)}`;
  if (candidate?.platform === 'static-geojson' || candidate?.platform === 'static-shapefile') {
    return Number(layerId) > 0 ? `${candidate.url}#layer=${encodeURIComponent(layerId)}` : candidate.url;
  }
  return `${inspection.url}/${layerId}`;
}

function candidateExtentContains(candidate, coordinates) {
  const extent = candidate?.extent;
  if (!Array.isArray(extent) || extent.length < 2 || !coordinates) return true;
  const a = extent[0];
  const b = extent[1];
  if (!Array.isArray(a) || !Array.isArray(b) || a.length < 2 || b.length < 2) return true;
  const nums = [a[0], a[1], b[0], b[1]].map(Number);
  if (!nums.every(Number.isFinite)) return true;
  if (Math.max(Math.abs(nums[0]), Math.abs(nums[2])) > 180 || Math.max(Math.abs(nums[1]), Math.abs(nums[3])) > 90) return true;
  const minX = Math.min(nums[0], nums[2]);
  const maxX = Math.max(nums[0], nums[2]);
  const minY = Math.min(nums[1], nums[3]);
  const maxY = Math.max(nums[1], nums[3]);
  return coordinates.longitude >= minX && coordinates.longitude <= maxX && coordinates.latitude >= minY && coordinates.latitude <= maxY;
}

function mergeLimitations(...groups) {
  const byCode = new Map();
  for (const row of groups.flat().filter(Boolean)) {
    const key = `${row.code || 'limitation'}:${row.excerpt || ''}`;
    if (!byCode.has(key)) byCode.set(key, row);
  }
  return [...byCode.values()];
}

export class PropertyResearchEngine {
  constructor({ geocoder, discovery, arcgis, wfs = null, genericRest = null, staticGis = null, registry, ordinanceDiscovery, documentDownloader, store = null, sourcePolicy }) {
    Object.assign(this, { geocoder, discovery, arcgis, wfs, genericRest, staticGis, registry, ordinanceDiscovery, documentDownloader, store, sourcePolicy });
  }

  async run(address, { fetchOrdinanceDocuments = true, maxGisCandidates = 8, maxOrdinanceDocuments = 3, onProgress = null } = {}) {
    const warnings = [];
    const provenance = [];
    const emit = async (stage, status = 'active', detail = null, extra = {}) => {
      if (typeof onProgress !== 'function') return;
      try { await onProgress({ type:'progress', stage, status, detail, at:new Date().toISOString(), ...extra }); } catch {}
    };
    await emit('geocode', 'active', 'Resolving address and jurisdiction');
    const geocode = await this.geocoder.geocode(address);
    if (!geocode.ok) {
      await emit('geocode', 'failed', geocode.reason || 'Address could not be resolved');
      return { packet: buildResearchPacket({ inputAddress: address, geocode, warnings: [geocode.reason], provenance }), markdown: '' };
    }
    await emit('geocode', 'done', geocode.matchedAddress || 'Address resolved');
    await emit('sources', 'active', 'Checking known sources and discovering public GIS');

    let registryRow = await this.registry.get(geocode.jurisdiction);
    let parcelCandidates = registryRow?.sources?.parcelCandidates || [];
    let zoningCandidates = registryRow?.sources?.zoningCandidates || [];
    const registeredOrdinanceSources = registryRow?.sources?.ordinanceSources || [];

    if (!parcelCandidates.length || !zoningCandidates.length) {
      const found = await this.discovery.discoverGis(geocode.jurisdiction);
      parcelCandidates = found.parcelCandidates;
      zoningCandidates = found.zoningCandidates;
      await this.registry.put(geocode.jurisdiction, { parcelCandidates, zoningCandidates, ordinanceSources:registeredOrdinanceSources });
    }
    const beforeExtentFilter = { parcel:parcelCandidates.length, zoning:zoningCandidates.length };
    parcelCandidates = parcelCandidates.filter((candidate) => candidateExtentContains(candidate, geocode.coordinates));
    zoningCandidates = zoningCandidates.filter((candidate) => candidateExtentContains(candidate, geocode.coordinates));
    const rejectedByExtent = (beforeExtentFilter.parcel - parcelCandidates.length) + (beforeExtentFilter.zoning - zoningCandidates.length);
    if (rejectedByExtent) warnings.push(`${rejectedByExtent} GIS candidate(s) rejected because their geographic extent did not contain the researched address.`);
    await emit('sources', 'done', `${parcelCandidates.length} parcel and ${zoningCandidates.length} zoning candidates`, { parcelCandidateCount:parcelCandidates.length, zoningCandidateCount:zoningCandidates.length });
    await emit('parcel', 'active', 'Inspecting candidate layers and locating parcel polygon');

    const inspected = new Map();
    const adapterFor = (candidate) => {
      if (!candidate?.url) return null;
      if ((candidate.platform === 'static-geojson' || candidate.platform === 'static-shapefile') && this.staticGis?.supports(candidate.url)) return this.staticGis;
      if (candidate.platform === 'wfs' && this.wfs?.supports(candidate.url)) return this.wfs;
      if (this.arcgis?.supports(candidate.url)) return this.arcgis;
      if (this.wfs?.supports(candidate.url)) return this.wfs;
      if (this.staticGis?.supports(candidate.url)) return this.staticGis;
      if (this.genericRest?.supports(candidate.url)) return this.genericRest;
      return null;
    };
    const inspect = async (candidate) => {
      const adapter = adapterFor(candidate);
      if (!adapter) return null;
      if (['superseded','historical'].includes(candidate.lifecycle?.status)) {
        warnings.push(`GIS source skipped (${candidate.lifecycle.status}): ${candidate.url}`);
        return null;
      }
      const policy = this.sourcePolicy?.decision(candidate.url, {
        official: candidate.official, kind:'gis', title:candidate.title, description:candidate.description,
        licenseInfo:candidate.licenseInfo, copyrightText:candidate.copyrightText, terms:candidate.terms
      });
      if (policy && policy.action !== 'fetch') {
        warnings.push(`GIS source skipped (${policy.reason}): ${candidate.url}`);
        return null;
      }
      if (!inspected.has(candidate.url)) {
        const inspection = await adapter.inspectService(candidate.url);
        const servicePolicy = this.sourcePolicy?.decision(candidate.url, {
          official:candidate.official, kind:'gis', title:candidate.title,
          description:inspection?.service?.description || candidate.description,
          licenseInfo:inspection?.service?.licenseInfo,
          copyrightText:inspection?.service?.copyrightText,
          terms:inspection?.service?.termsOfUse
        });
        const serviceLifecycle = sourceLifecycle({
          title:candidate.title,
          description:`${candidate.description || ''} ${inspection?.service?.description || ''} ${inspection?.service?.documentInfo?.Title || ''} ${inspection?.service?.documentInfo?.Comments || ''}`
        });
        if (['superseded','historical'].includes(serviceLifecycle.status)) {
          warnings.push(`GIS service metadata indicates ${serviceLifecycle.status} data; source skipped: ${candidate.url}`);
          inspected.set(candidate.url, null);
        } else if (servicePolicy && servicePolicy.action !== 'fetch') {
          warnings.push(`GIS service metadata requires review (${servicePolicy.reason}): ${candidate.url}`);
          inspected.set(candidate.url, null);
        } else {
          inspected.set(candidate.url, { ...inspection, sourcePolicy:servicePolicy || policy || null, sourceLimitations:mergeLimitations(policy?.limitations, servicePolicy?.limitations) });
        }
      }
      const value = inspected.get(candidate.url);
      return value ? { ...value, adapter } : null;
    };

    let parcel = null;
    let parcelSource = null;
    for (const candidate of parcelCandidates.slice(0, maxGisCandidates)) {
      try {
        const inspectedResult = await inspect(candidate);
        if (!inspectedResult) continue;
        const { adapter, ...inspection } = inspectedResult;
        const ranked = adapter.rankLayers(inspection, 'parcel');
        for (const rank of ranked.slice(0, 4)) {
          if (rank.score < 28) continue;
          let result = await adapter.queryPoint(candidate.url, rank.layer.id, geocode.coordinates);
          let f = result?.features?.[0] || null;
          let parcelResolution = f ? 'exact-point' : null;
          if (!f && adapter === this.arcgis && typeof adapter.queryNearby === 'function') {
            const nearby = await adapter.queryNearby(candidate.url, rank.layer.id, geocode.coordinates, { meters:45 });
            const selected = chooseNearbyParcel(nearby?.features || [], address);
            f = selected.feature;
            parcelResolution = f ? selected.reason : null;
            if (!f && selected.reason === 'ambiguous') warnings.push(`Nearby parcel lookup returned ${selected.count} candidates and could not match the input address confidently: ${candidate.url}/${rank.layer.id}`);
          }
          if (!f) continue;
          if (parcelResolution !== 'exact-point') warnings.push(`Parcel resolved using ${parcelResolution === 'address-match' ? 'nearby address matching' : 'a nearby search'} because the Census geocode did not fall inside a parcel polygon.`);
          parcel = {
            sourceUrl:layerSourceUrl(candidate, inspection, rank.layer.id), sourceTitle:candidate.title,
            platform:candidate.platform || 'arcgis', layerId:rank.layer.id, layerName:rank.layer.name,
            layerScore:rank.score, layerScoreReasons:rank.reasons, properties:featureProps(f),
            geometry:esriGeometryToGeoJSON(featureGeom(f)),
            esriGeometry:featureGeom(f)?.rings ? featureGeom(f) : geoJSONToEsriGeometry(esriGeometryToGeoJSON(featureGeom(f))),
            rawFeature:f, resolutionMethod:parcelResolution || 'exact-point',
            sourceLimitations:inspection.sourceLimitations || [], sourceFreshness:candidate.freshness || null
          };
          parcelSource = candidate;
          provenance.push({ kind:'parcel-gis', url:parcel.sourceUrl, retrievedAt:new Date().toISOString(), confidence:candidate.confidence, freshness:candidate.freshness || null, limitations:parcel.sourceLimitations });
          if (candidate.freshness?.status === 'stale-signal') warnings.push(`Selected parcel source item metadata is ${candidate.freshness.ageDays} days old; verify that the underlying dataset is still current: ${candidate.url}`);
          break;
        }
        if (parcel) break;
      } catch (error) { warnings.push(`Parcel candidate failed: ${candidate.url}: ${error.message}`); }
    }
    if (!parcel) {
      warnings.push('No parcel polygon was found from the discovered public GIS candidates.');
      await emit('parcel', 'failed', 'No intersecting parcel polygon found');
    } else await emit('parcel', 'done', parcel.layerName || 'Parcel located', { sourceUrl:parcel.sourceUrl });
    await emit('zoning', 'active', 'Intersecting parcel geometry with zoning layers');

    const zoning = [];
    if (parcel?.geometry) {
      for (const candidate of zoningCandidates.slice(0, maxGisCandidates)) {
        try {
          const inspectedResult = await inspect(candidate);
          if (!inspectedResult) continue;
          const { adapter, ...inspection } = inspectedResult;
          const ranked = adapter.rankLayers(inspection, 'zoning');
          for (const rank of ranked.slice(0, 4)) {
            if (rank.score < 35) continue;
            const queryGeometry = adapter === this.arcgis ? parcel.esriGeometry : parcel.geometry;
            const result = await adapter.queryGeometry(candidate.url, rank.layer.id, queryGeometry, { inSR:4326 });
            if (!result?.features?.length) continue;
            zoning.push({
              sourceUrl:layerSourceUrl(candidate, inspection, rank.layer.id), sourceTitle:candidate.title,
              platform:candidate.platform || 'arcgis', layerId:rank.layer.id, layerName:rank.layer.name,
              layerScore:rank.score, layerScoreReasons:rank.reasons, sourceLimitations:inspection.sourceLimitations || [],
              sourceFreshness:candidate.freshness || null,
              features:result.features.map((f) => ({ ...f, esriGeometry:f.geometry || null, geometry:esriGeometryToGeoJSON(f.geometry) }))
            });
            provenance.push({ kind:'zoning-gis', url:layerSourceUrl(candidate, inspection, rank.layer.id), retrievedAt:new Date().toISOString(), confidence:candidate.confidence, freshness:candidate.freshness || null, limitations:inspection.sourceLimitations || [] });
            if (candidate.freshness?.status === 'stale-signal') warnings.push(`Selected zoning source item metadata is ${candidate.freshness.ageDays} days old; verify that the underlying dataset is still current: ${candidate.url}`);
            break;
          }
        } catch (error) { warnings.push(`Zoning candidate failed: ${candidate.url}: ${error.message}`); }
        if (zoning.length >= 3) break;
      }
    }
    if (!zoning.length) {
      warnings.push('No intersecting zoning feature was found from discovered public GIS candidates.');
      await emit('zoning', 'failed', 'No intersecting zoning feature found');
    } else {
      const count = zoning.reduce((sum, row) => sum + (row.features?.length || 0), 0);
      await emit('zoning', 'done', `${count} zoning feature${count === 1 ? '' : 's'} intersect parcel`, { zoningFeatureCount:count });
    }
    await emit('ordinance', 'active', 'Locating official zoning code and ordinance sources');

    let ordinanceSources = [...registeredOrdinanceSources];
    const zoneIdentifiers = zoningIdentifiers(zoning);
    try {
      const discoveredOrdinances = await this.ordinanceDiscovery.discover(geocode.jurisdiction, { zoningIdentifiers:zoneIdentifiers });
      const byUrl = new Map([...ordinanceSources, ...discoveredOrdinances].filter((x) => x?.url).map((x) => [x.url, x]));
      ordinanceSources = [...byUrl.values()].sort((a,b) => (b.confidence || 0) - (a.confidence || 0));
    } catch (error) { warnings.push(`Ordinance discovery failed: ${error.message}`); }
    await emit('ordinance', ordinanceSources.length ? 'done' : 'failed', ordinanceSources.length ? `${ordinanceSources.length} ordinance/code source${ordinanceSources.length === 1 ? '' : 's'} found` : 'No ordinance/code source found', { ordinanceSourceCount:ordinanceSources.length });

    const documents = [];
    if (fetchOrdinanceDocuments && ordinanceSources.length) await emit('ordinance', 'active', 'Downloading and indexing permitted ordinance documents');
    if (fetchOrdinanceDocuments) {
      for (const candidate of ordinanceSources.slice(0, maxOrdinanceDocuments)) {
        try {
          const d = await this.documentDownloader.fetchDocument(candidate);
          documents.push(d);
          if (d.fetched) provenance.push({ kind:'ordinance-document', url:candidate.url, retrievedAt:d.retrievedAt });
        } catch (error) { warnings.push(`Document fetch failed: ${candidate.url}: ${error.message}`); }
      }
    }

    await emit('packet', 'active', 'Assembling source provenance and research packet');
    const packet = buildResearchPacket({ inputAddress:address, geocode, parcel, parcelSource, zoning, zoningSources:zoningCandidates.slice(0,8), zoningIdentifiers:zoneIdentifiers, gisSources:[parcelSource, ...zoningCandidates.slice(0,8)].filter(Boolean), ordinanceSources, documents, warnings, provenance });
    if (packet.assessment?.status === 'complete') await this.registry?.markSuccess?.(geocode.jurisdiction).catch?.(() => null);
    else await this.registry?.markFailure?.(geocode.jurisdiction).catch?.(() => null);
    let runId = null;
    if (this.store?.enabled?.()) runId = await this.store.saveResearchRun(packet);
    await emit('packet', 'done', `${packet.assessment?.completenessScore ?? 0}% source completeness`, { assessment:packet.assessment, runId });
    return { packet, markdown:packetToMarkdown(packet), runId };
  }
}
