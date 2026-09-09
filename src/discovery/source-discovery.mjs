import { sourceAuthorityScore } from '../confidence/scoring.mjs';

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

function asWebGisCandidate(result, jurisdiction) {
  const url = normalizeArcGisServiceUrl(result.url);
  if (!url) return null;
  let host = '';
  try { host = new URL(url).hostname.toLowerCase(); } catch {}
  const official = host.endsWith('.gov') || host.endsWith('.us');
  const base = {
    platform: 'arcgis',
    discoverySource: result.source || 'web-search',
    title: result.title || url,
    description: result.description || '',
    url,
    official,
    access: 'public'
  };
  const authority = sourceAuthorityScore(base, jurisdiction);
  return { ...base, confidence: authority.score, confidenceReasons: authority.reasons };
}

function asWfsCandidate(result, jurisdiction) {
  let u;
  try { u = new URL(result.url); } catch { return null; }
  const looksWfs = /(?:^|\/)wfs(?:\/|$)/i.test(u.pathname) || /^wfs$/i.test(u.searchParams.get('service') || '') || /geoserver/i.test(u.pathname);
  if (!looksWfs) return null;
  const host = u.hostname.toLowerCase();
  const base = {
    platform: 'wfs', discoverySource: result.source || 'web-search', title: result.title || result.url,
    description: result.description || '', url: result.url,
    official: host.endsWith('.gov') || host.endsWith('.us'), access: 'public'
  };
  const authority = sourceAuthorityScore(base, jurisdiction);
  return { ...base, confidence: authority.score, confidenceReasons: authority.reasons };
}

function dedupeAndSort(candidates) {
  const byUrl = new Map();
  for (const candidate of candidates.filter(Boolean)) {
    const current = byUrl.get(candidate.url);
    if (!current || (candidate.confidence || 0) > (current.confidence || 0)) byUrl.set(candidate.url, candidate);
  }
  return [...byUrl.values()].sort((a, b) => (b.confidence || 0) - (a.confidence || 0));
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

    const webCandidates = webResults.flatMap((r) => [asWebGisCandidate(r, jurisdiction), asWfsCandidate(r, jurisdiction)]).filter(Boolean);
    const parcelWeb = webCandidates.filter((c) => /parcel|cadastre|cadastral|tax.?lot|property/i.test(`${c.title} ${c.description} ${c.url}`));
    const zoningWeb = webCandidates.filter((c) => /zoning|zone|land.?use/i.test(`${c.title} ${c.description} ${c.url}`));
    const neutralWeb = webCandidates.filter((c) => !parcelWeb.includes(c) && !zoningWeb.includes(c));

    return {
      parcelCandidates: dedupeAndSort([...portalParcel, ...directoryParcel, ...hubCandidates, ...parcelWeb, ...neutralWeb]),
      zoningCandidates: dedupeAndSort([...portalZoning, ...directoryZoning, ...hubCandidates, ...zoningWeb, ...neutralWeb])
    };
  }

  async discoverOfficialWebSources(jurisdiction, purpose, extraQueries = []) {
    const aliases = (jurisdiction.candidates || []).filter((x) => x.priority >= 80).map((x) => x.name);
    const primary = jurisdiction.municipality || aliases[0];
    const place = [primary, jurisdiction.county, jurisdiction.state].filter(Boolean).join(' ');
    const terms = purpose === 'ordinance'
      ? [`${place} zoning ordinance`, `${place} zoning code`, `${place} zoning amendments`]
      : [
          `${place} parcel GIS FeatureServer`,
          `${place} parcel GIS MapServer`,
          `${place} zoning GIS FeatureServer`,
          `${place} zoning GIS MapServer`,
          `${place} arcgis rest services parcel`,
          `${place} arcgis rest services zoning`,
          `${place} parcel WFS GIS`,
          `${place} zoning WFS GIS`
        ];
    const results = [];
    for (const q of [...terms, ...extraQueries]) results.push(...await this.webSearch.search(q, { count: 10 }));
    const unique = new Map(results.map((r) => [r.url, r]));
    return [...unique.values()];
  }
}

export { normalizeArcGisServiceUrl };
