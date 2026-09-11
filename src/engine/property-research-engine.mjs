import { buildResearchPacket, packetToMarkdown } from '../packets/research-packet.mjs';
import { zoningIdentifiers } from '../indexing/text-index.mjs';
import { rethrowIfAborted } from '../core/abort.mjs';
import { candidateExtentContains } from './research-helpers.mjs';
import { createSourceInspector } from './source-inspector.mjs';
import { findParcel } from './parcel-stage.mjs';
import { findZoning } from './zoning-stage.mjs';

export class PropertyResearchEngine {
  constructor({ geocoder, discovery, arcgis, wfs = null, genericRest = null, staticGis = null, registry, ordinanceDiscovery, documentDownloader, store = null, sourcePolicy }) {
    Object.assign(this, { geocoder, discovery, arcgis, wfs, genericRest, staticGis, registry, ordinanceDiscovery, documentDownloader, store, sourcePolicy });
  }

  async run(address, { fetchOrdinanceDocuments = true, fetchBlueprintDocuments = true, maxGisCandidates = 8, maxOrdinanceDocuments = 3, maxBlueprintDocuments = 3, onProgress = null, signal = null } = {}) {
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
      return { packet:buildResearchPacket({ inputAddress:address, geocode, warnings:[geocode.reason], provenance }), markdown:'' };
    }
    await emit('geocode', 'done', geocode.matchedAddress || 'Address resolved');
    await emit('sources', 'active', 'Checking known sources and discovering public GIS');

    const registryRow = await this.registry.get(geocode.jurisdiction);
    let parcelCandidates = registryRow?.sources?.parcelCandidates || [];
    let zoningCandidates = registryRow?.sources?.zoningCandidates || [];
    const registeredOrdinanceSources = registryRow?.sources?.ordinanceSources || [];

    if (!parcelCandidates.length || !zoningCandidates.length) {
      const found = await this.discovery.discoverGis(geocode.jurisdiction);
      parcelCandidates = found.parcelCandidates;
      zoningCandidates = found.zoningCandidates;
      await this.registry.put(geocode.jurisdiction, { parcelCandidates, zoningCandidates, ordinanceSources:registeredOrdinanceSources });
    }

    const before = { parcel:parcelCandidates.length, zoning:zoningCandidates.length };
    parcelCandidates = parcelCandidates.filter((candidate) => candidateExtentContains(candidate, geocode.coordinates));
    zoningCandidates = zoningCandidates.filter((candidate) => candidateExtentContains(candidate, geocode.coordinates));
    const rejected = (before.parcel - parcelCandidates.length) + (before.zoning - zoningCandidates.length);
    if (rejected) warnings.push(`${rejected} GIS candidate(s) rejected because their geographic extent did not contain the researched address.`);
    await emit('sources', 'done', `${parcelCandidates.length} parcel and ${zoningCandidates.length} zoning candidates`, {
      parcelCandidateCount:parcelCandidates.length, zoningCandidateCount:zoningCandidates.length
    });

    const inspect = createSourceInspector(this, warnings);
    await emit('parcel', 'active', 'Inspecting candidate layers and locating parcel polygon');
    const { parcel, parcelSource } = await findParcel({
      engine:this, address, geocode, candidates:parcelCandidates, maxCandidates:maxGisCandidates,
      inspect, warnings, provenance
    });
    if (!parcel) {
      warnings.push('No parcel polygon was found from the discovered public GIS candidates.');
      await emit('parcel', 'failed', 'No intersecting parcel polygon found');
    } else {
      await emit('parcel', 'done', parcel.layerName || 'Parcel located', { sourceUrl:parcel.sourceUrl });
    }

    await emit('zoning', 'active', 'Intersecting parcel geometry with zoning layers');
    const zoning = await findZoning({
      engine:this, parcel, candidates:zoningCandidates, maxCandidates:maxGisCandidates,
      inspect, warnings, provenance
    });
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
      const discovered = await this.ordinanceDiscovery.discover(geocode.jurisdiction, { zoningIdentifiers:zoneIdentifiers });
      const byUrl = new Map([...ordinanceSources, ...discovered].filter((x) => x?.url).map((x) => [x.url, x]));
      ordinanceSources = [...byUrl.values()].sort((a,b) => (b.confidence || 0) - (a.confidence || 0));
    } catch (error) {
      rethrowIfAborted(error, signal);
      warnings.push(`Ordinance discovery failed: ${error.message}`);
    }
    await emit('ordinance', ordinanceSources.length ? 'done' : 'failed', ordinanceSources.length
      ? `${ordinanceSources.length} ordinance/code source${ordinanceSources.length === 1 ? '' : 's'} found`
      : 'No ordinance/code source found', { ordinanceSourceCount:ordinanceSources.length });

    const documents = [];
    if (fetchOrdinanceDocuments && ordinanceSources.length) {
      await emit('ordinance', 'active', 'Downloading and indexing permitted ordinance documents');
      for (const candidate of ordinanceSources.slice(0, maxOrdinanceDocuments)) {
        try {
          const document = await this.documentDownloader.fetchDocument(candidate);
          documents.push(document);
          if (document.fetched) provenance.push({ kind:'ordinance-document', url:candidate.url, retrievedAt:document.retrievedAt });
        } catch (error) {
          rethrowIfAborted(error, signal);
          warnings.push(`Document fetch failed: ${candidate.url}: ${error.message}`);
        }
      }
    }

    await emit('packet', 'active', 'Assembling source provenance and research packet');
    const packet = buildResearchPacket({
      inputAddress:address,
      geocode,
      parcel,
      parcelSource,
      zoning,
      zoningSources:zoningCandidates.slice(0, 8),
      zoningIdentifiers:zoneIdentifiers,
      gisSources:[parcelSource, ...zoningCandidates.slice(0, 8)].filter(Boolean),
      ordinanceSources,
      documents,
      warnings,
      provenance
    });
    if (packet.assessment?.status === 'complete') await this.registry?.markSuccess?.(geocode.jurisdiction).catch?.(() => null);
    else await this.registry?.markFailure?.(geocode.jurisdiction).catch?.(() => null);
    let runId = null;
    if (this.store?.enabled?.()) runId = await this.store.saveResearchRun(packet);
    await emit('packet', 'done', `${packet.assessment?.completenessScore ?? 0}% source completeness`, { assessment:packet.assessment, runId });
    return { packet, markdown:packetToMarkdown(packet), runId };
  }
}
