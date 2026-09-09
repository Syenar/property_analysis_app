import { sourceAuthorityScore, sourceFreshness } from '../confidence/scoring.mjs';

const SEARCH = 'https://www.arcgis.com/sharing/rest/search';

export class ArcGISPortalDiscovery {
  constructor({ http, maxPerQuery = 40 } = {}) {
    this.http = http;
    this.maxPerQuery = maxPerQuery;
  }

  async search(jurisdiction, purpose) {
    const aliases = (jurisdiction.candidates || []).filter((x) => x.priority >= 80).map((x) => x.name);
    const place = [jurisdiction.municipality || aliases[0], jurisdiction.county, jurisdiction.state].filter(Boolean).join(' ');
    const purposeTerms = purpose === 'parcel' ? ['parcel', 'parcels', 'cadastre', 'tax parcel'] : ['zoning', 'zoning district'];
    const items = [];
    for (const term of purposeTerms) {
      const q = `${JSON.stringify(place)} ${term} (type:"Feature Service" OR type:"Map Service")`;
      const url = new URL(SEARCH);
      url.searchParams.set('f', 'json');
      url.searchParams.set('num', String(this.maxPerQuery));
      url.searchParams.set('q', q);
      const data = await this.http.getJson(url.toString());
      for (const item of data.results || []) {
        if (!item.url) continue;
        const candidate = {
          platform: 'arcgis',
          itemId: item.id,
          title: item.title,
          description: item.description || item.snippet || '',
          owner: item.owner,
          access: item.access,
          modified: item.modified ? new Date(item.modified).toISOString() : null,
          url: item.url,
          itemType: item.type,
          tags: item.tags || [],
          extent: item.extent || null
        };
        const authority = sourceAuthorityScore(candidate, jurisdiction);
        items.push({ ...candidate, freshness: sourceFreshness(candidate.modified), confidence: authority.score, confidenceReasons: authority.reasons });
      }
    }
    const byUrl = new Map();
    for (const item of items) {
      const current = byUrl.get(item.url);
      if (!current || item.confidence > current.confidence) byUrl.set(item.url, item);
    }
    return [...byUrl.values()].sort((a, b) => b.confidence - a.confidence);
  }
}
