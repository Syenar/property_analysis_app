import { sourceAuthorityScore, sourceLifecycle } from '../confidence/scoring.mjs';

function normalizeArcGisServiceUrl(input) {
  try {
    const u = new URL(input);
    const match = u.pathname.match(/^(.*\/(?:FeatureServer|MapServer))(?:\/\d+)?\/?$/i);
    if (!match) return null;
    u.pathname = match[1];
    u.search = '';
    u.hash = '';
    return u.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function officialHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith('.gov') || host.endsWith('.us');
  } catch { return false; }
}

function applyAuthority(base, jurisdiction) {
  const authority = sourceAuthorityScore(base, jurisdiction);
  return {
    ...base,
    lifecycle: authority.lifecycle || sourceLifecycle(base),
    confidence: authority.score,
    confidenceReasons: authority.reasons
  };
}

function asWebGisCandidate(result, jurisdiction) {
  const url = normalizeArcGisServiceUrl(result.url);
  if (!url) return null;
  return applyAuthority({
    platform: 'arcgis',
    discoverySource: result.source || 'web-search',
    discoveryScope: result.discoveryScope || null,
    title: result.title || url,
    description: result.description || '',
    url,
    official: officialHost(url),
    access: 'public'
  }, jurisdiction);
}

function asWfsCandidate(result, jurisdiction) {
  let u;
  try { u = new URL(result.url); } catch { return null; }
  const looksWfs = /(?:^|\/)wfs(?:\/|$)/i.test(u.pathname) || /^wfs$/i.test(u.searchParams.get('service') || '') || /geoserver/i.test(u.pathname);
  if (!looksWfs) return null;
  return applyAuthority({
    platform: 'wfs', discoverySource: result.source || 'web-search', discoveryScope: result.discoveryScope || null,
    title: result.title || result.url,
    description: result.description || '', url: result.url,
    official: officialHost(result.url), access: 'public'
  }, jurisdiction);
}

export function detectStaticGisFormat(input, context = '') {
  let u;
  try { u = new URL(input); } catch { return null; }
  const path = decodeURIComponent(u.pathname).toLowerCase();
  const query = u.search.toLowerCase();
  const hay = `${path} ${query} ${context}`.toLowerCase();
  if (/\.geojson$/.test(path) || /(?:format|f|outputformat)=geojson/.test(query) || /geojson/.test(hay) && /download|dataset|parcel|zoning|gis/.test(hay)) return 'geojson';
  if (/\.zip$/.test(path) && /shapefile|shape.?file|parcel|zoning|gis|download|dataset/.test(hay)) return 'shapefile';
  if (/\.shp$/.test(path)) return 'shapefile';
  if (/\.json$/.test(path) && /parcel|zoning|cadastre|cadastral|gis|geojson/.test(hay)) return 'geojson';
  return null;
}

function asStaticGisCandidate(result, jurisdiction) {
  const context = `${result.title || ''} ${result.description || ''}`;
  const format = detectStaticGisFormat(result.url, context);
  if (!format) return null;
  return applyAuthority({
    platform: format === 'geojson' ? 'static-geojson' : 'static-shapefile',
    format,
    discoverySource: result.source || 'web-search',
    discoveryScope: result.discoveryScope || null,
    title: result.title || result.url,
    description: result.description || '',
    url: result.url,
    official: officialHost(result.url),
    access: 'public'
  }, jurisdiction);
}

function dedupeAndSort(candidates) {
  const byUrl = new Map();
  for (const candidate of candidates.filter(Boolean)) {
    const current = byUrl.get(candidate.url);
    if (!current || (candidate.confidence || 0) > (current.confidence || 0)) byUrl.set(candidate.url, candidate);
  }
  return [...byUrl.values()].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
}

function jurisdictionSearchScopes(jurisdiction, { includeCounty = true, includeState = false } = {}) {
  const aliases = (jurisdiction.candidates || []).filter((x) => x.priority >= 80).map((x) => x.name);
  const primary = jurisdiction.municipality || aliases[0];
  const state = jurisdiction.state || '';
  const scopes = [];
  if (primary) scopes.push({ scope:'municipality', place:[primary, state].filter(Boolean).join(' ') });
  if (includeCounty && jurisdiction.county && !String(jurisdiction.county).toLowerCase().includes(String(primary || '').toLowerCase())) {
    scopes.push({ scope:'county', place:[jurisdiction.county, state].filter(Boolean).join(' ') });
  }
  if (includeState && state) scopes.push({ scope:'state', place:state });
  if (!scopes.length) scopes.push({ scope:'jurisdiction', place:[jurisdiction.county, state].filter(Boolean).join(' ') });
  const seen = new Set();
  return scopes.filter((row) => row.place && !seen.has(row.place.toLowerCase()) && seen.add(row.place.toLowerCase()));
}

export class SourceDiscoveryEngine {
  constructor({ arcgis, webSearch, arcgisDirectory = null, arcgisHub = null }) {
    this.arcgis = arcgis;
    this.webSearch = webSearch;
    this.arcgisDirectory = arcgisDirectory;
    this.arcgisHub = arcgisHub;
  }

  async discoverGis(jurisdiction) {
    const [portalParcel, portalZoning, webResults] = await Promise.all([
      this.arcgis.search(jurisdiction, 'parcel'),
      this.arcgis.search(jurisdiction, 'zoning'),
      this.discoverOfficialWebSources(jurisdiction, 'gis')
    ]);

    const directoryRoots = webResults.map((r) => r.url);
    const [directoryParcel, directoryZoning] = this.arcgisDirectory
      ? await Promise.all([
          this.arcgisDirectory.discoverFromRoots(directoryRoots, jurisdiction, 'parcel'),
          this.arcgisDirectory.discoverFromRoots(directoryRoots, jurisdiction, 'zoning')
        ])
      : [[], []];

    const hubCandidates = this.arcgisHub
      ? await this.arcgisHub.resolveResults(webResults, jurisdiction)
      : [];

    const webCandidates = webResults.flatMap((r) => [
      asWebGisCandidate(r, jurisdiction),
      asWfsCandidate(r, jurisdiction),
      asStaticGisCandidate(r, jurisdiction)
    ]).filter(Boolean);

    const parcelWeb = webCandidates.filter((c) => /parcel|cadastre|cadastral|tax.?lot|property|assessment/i.test(`${c.title} ${c.description} ${c.url}`));
    const zoningWeb = webCandidates.filter((c) => /zoning|zone|land.?use/i.test(`${c.title} ${c.description} ${c.url}`));
    const neutralWeb = webCandidates.filter((c) => !parcelWeb.includes(c) && !zoningWeb.includes(c));

    return {
      parcelCandidates: dedupeAndSort([...portalParcel, ...directoryParcel, ...hubCandidates, ...parcelWeb, ...neutralWeb]),
      zoningCandidates: dedupeAndSort([...portalZoning, ...directoryZoning, ...hubCandidates, ...zoningWeb, ...neutralWeb])
    };
  }

  async discoverOfficialWebSources(jurisdiction, purpose, extraQueries = [], { signal } = {}) {
    const queryRows = [];
    if (purpose === 'ordinance') {
      for (const row of jurisdictionSearchScopes(jurisdiction, { includeCounty: !jurisdiction.municipality })) {
        queryRows.push(
          { ...row, q:`${row.place} zoning ordinance` },
          { ...row, q:`${row.place} zoning code` },
          { ...row, q:`${row.place} zoning amendments` }
        );
      }
    } else if (purpose === 'blueprint') {
      for (const row of jurisdictionSearchScopes(jurisdiction, { includeCounty:true })) {
        queryRows.push(
          { ...row, q:`${row.place} building permit plans drawings` },
          { ...row, q:`${row.place} permit portal architectural plans` },
          { ...row, q:`${row.place} planning development plan attachments` }
        );
      }
    } else {
      for (const row of jurisdictionSearchScopes(jurisdiction, { includeCounty:true, includeState:true })) {
        const place = row.place;
        const common = [
          `${place} parcel GIS ArcGIS REST FeatureServer MapServer`,
          `${place} zoning GIS ArcGIS REST FeatureServer MapServer`,
          `${place} parcel zoning GIS data download GeoJSON shapefile WFS`
        ];
        const selected = row.scope === 'state'
          ? [`${place} statewide parcel GIS ArcGIS`, `${place} parcel open data GeoJSON shapefile`]
          : common;
        selected.forEach((q) => queryRows.push({ ...row, q }));
      }
    }

    for (const q of extraQueries) queryRows.push({ scope:'extra', place:'', q });

    const results = [];
    for (const row of queryRows) {
      const found = await this.webSearch.search(row.q, { count: 10, signal });
      for (const result of found) results.push({ ...result, discoveryScope: result.discoveryScope || row.scope, discoveryQuery: row.q });
    }
    const unique = new Map();
    for (const result of results) {
      const existing = unique.get(result.url);
      if (!existing || (existing.discoveryScope === 'state' && result.discoveryScope !== 'state')) unique.set(result.url, result);
    }
    return [...unique.values()];
  }
}

export { normalizeArcGisServiceUrl, jurisdictionSearchScopes };
