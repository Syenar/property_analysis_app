function baseHeaders(key, extra = {}) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Prefer: 'return=representation',
    ...extra
  };
}

export class SupabaseRestStore {
  constructor({ http, url, serviceRoleKey, persistEnabled = true }) {
    this.http = http;
    this.url = String(url || '').replace(/\/$/, '');
    this.key = serviceRoleKey;
    this.persistEnabled = Boolean(persistEnabled);
  }

  enabled() { return Boolean(this.persistEnabled && this.url && this.key); }

  async insert(table, row) {
    const response = await this.http.request(`${this.url}/rest/v1/${table}`, {
      method: 'POST', headers: baseHeaders(this.key), body: JSON.stringify(row)
    });
    return await response.json();
  }

  async upsert(table, row, onConflict) {
    const url = new URL(`${this.url}/rest/v1/${table}`);
    if (onConflict) url.searchParams.set('on_conflict', onConflict);
    const response = await this.http.request(url.toString(), {
      method: 'POST', headers: baseHeaders(this.key, { Prefer: 'resolution=merge-duplicates,return=representation' }), body: JSON.stringify(row)
    });
    return await response.json();
  }

  async patch(table, filters, changes) {
    const url = new URL(`${this.url}/rest/v1/${table}`);
    for (const [key, value] of Object.entries(filters || {})) url.searchParams.set(key, `eq.${value}`);
    const response = await this.http.request(url.toString(), {
      method: 'PATCH', headers: baseHeaders(this.key), body: JSON.stringify(changes)
    });
    return await response.json();
  }

  async select(table, filters = {}, { limit = 100, order = null } = {}) {
    const url = new URL(`${this.url}/rest/v1/${table}`);
    url.searchParams.set('select', '*');
    url.searchParams.set('limit', String(limit));
    for (const [key, value] of Object.entries(filters)) url.searchParams.set(key, `eq.${value}`);
    if (order) url.searchParams.set('order', order);
    const response = await this.http.request(url.toString(), { headers: baseHeaders(this.key, { Prefer: 'return=representation' }) });
    return await response.json();
  }

  async selectOne(table, filters = {}) {
    const rows = await this.select(table, filters, { limit: 1 });
    return rows?.[0] || null;
  }

  async rpc(name, payload) {
    const response = await this.http.request(`${this.url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: baseHeaders(this.key), body: JSON.stringify(payload)
    });
    const text = await response.text();
    return text ? JSON.parse(text) : null;
  }

  async searchDocumentSections(runId, query, limit = 20) {
    if (!this.enabled() || !runId || !String(query || '').trim()) return [];
    return await this.rpc('search_document_sections', {
      p_run_id: runId,
      p_query: String(query).trim(),
      p_limit: Math.min(100, Math.max(1, Number(limit) || 20))
    }) || [];
  }

  async saveResearchRun(packet) {
    if (!this.enabled()) return null;
    const runRows = await this.insert('research_runs', {
      input_address: packet.inputAddress,
      matched_address: packet.geocode?.matchedAddress || null,
      status: packet.assessment?.status === 'complete' ? 'completed' : packet.assessment?.status === 'failed' ? 'failed' : 'partial',
      packet_json: packet
    });
    const runId = runRows?.[0]?.id;
    if (runId) {
      await this.insert('source_snapshots', {
        research_run_id: runId, kind: 'census-geocode', url: packet.geocode?.sourceUrl || 'https://geocoding.geo.census.gov/',
        content_type: 'application/json', retrieved_at: packet.generatedAt, payload_json: packet.geocode?.raw || packet.geocode || null
      }).catch(() => null);
      if (packet.parcel?.rawFeature) {
        await this.insert('source_snapshots', {
          research_run_id: runId, kind: 'parcel-feature', url: packet.parcel.sourceUrl, content_type: 'application/json',
          retrieved_at: packet.generatedAt, payload_json: packet.parcel.rawFeature
        }).catch(() => null);
      }
      for (const z of packet.zoning || []) {
        await this.insert('source_snapshots', {
          research_run_id: runId, kind: 'zoning-query', url: z.sourceUrl, content_type: 'application/json',
          retrieved_at: packet.generatedAt, payload_json: { layerId: z.layerId, layerName: z.layerName, features: z.features || [] }
        }).catch(() => null);
      }
    }
    if (runId && packet.parcel?.geometry) {
      await this.rpc('upsert_parcel_geojson', {
        p_run_id: runId,
        p_source_url: packet.parcel.sourceUrl || null,
        p_properties: packet.parcel.properties || {},
        p_geojson: packet.parcel.geometry
      });
    }
    if (runId) {
      for (const z of packet.zoning || []) {
        for (const f of z.features || []) {
          if (!f.geometry) continue;
          await this.rpc('insert_zoning_geojson', {
            p_run_id: runId,
            p_source_url: z.sourceUrl || null,
            p_properties: f.properties || f.attributes || {},
            p_geojson: f.geometry
          });
        }
      }

      const sourceRows = [];
      const addSource = (kind, s) => {
        if (!s?.url) return;
        let host = null;
        try { host = new URL(s.url).hostname; } catch {}
        sourceRows.push({
          research_run_id: runId, kind, url: s.url, title: s.title || s.sourceTitle || null, host,
          official: Boolean(s.official), confidence: Number.isFinite(s.confidence) ? s.confidence : null,
          confidence_reasons: s.confidenceReasons || [], automation_action: s.automation?.action || null,
          retrieved_at: s.retrievedAt || null, source_modified_at: s.modified || null, raw_metadata: s
        });
      };
      for (const s of packet.gisSources || []) addSource('gis-candidate', s);
      for (const s of packet.ordinanceSources || []) addSource('ordinance-candidate', s);
      for (const s of packet.provenance || []) addSource(s.kind || 'provenance', s);
      for (const row of sourceRows) await this.upsert('sources', row, 'research_run_id,kind,url');

      for (const d of packet.documents || []) {
        if (!d?.url) continue;
        const rows = await this.upsert('documents', {
          research_run_id: runId, source_url: d.url, title: d.title || null, content_type: d.contentType || null,
          byte_count: d.bytes || null, sha256: d.sha256 || null, retrieved_at: d.retrievedAt || null, source_modified_at: d.sourceModifiedAt || null, policy: d.policy || null,
          raw_metadata: { fetched: d.fetched, keywordHits: d.keywordHits || [] }
        }, 'research_run_id,source_url');
        const documentId = rows?.[0]?.id;
        if (!documentId) continue;
        let ordinal = 0;
        for (const section of d.sections || []) {
          await this.upsert('document_sections', {
            document_id: documentId, ordinal: ordinal++, heading: section.heading || null, body: section.body || section.text || ''
          }, 'document_id,ordinal');
        }
      }
    }
    return runId;
  }
}
