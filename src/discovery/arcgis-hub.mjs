import { sourceAuthorityScore, sourceFreshness } from '../confidence/scoring.mjs';

const ITEM_ID_RE = /^[0-9a-f]{32}$/i;

export function extractArcGisItemId(input) {
  let url;
  try { url = new URL(input); } catch { return null; }

  for (const key of ['id', 'webmap', 'item', 'itemid']) {
    const value = url.searchParams.get(key);
    if (value && ITEM_ID_RE.test(value)) return value;
  }

  const parts = url.pathname.split('/').filter(Boolean);
  for (let i = parts.length - 1; i >= 0; i--) {
    const part = parts[i].replace(/\.(?:json|html?)$/i, '');
    if (ITEM_ID_RE.test(part)) return part;
  }

  return null;
}

function normalizeServiceUrl(input) {
  try {
    const url = new URL(input);
    const match = url.pathname.match(/^(.*\/(?:FeatureServer|MapServer))(?:\/\d+)?\/?$/i);
    if (!match) return null;
    url.pathname = match[1];
    url.search = '';
    url.hash = '';
    return url.toString().replace(/\/$/, '');
  } catch {
    return null;
  }
}

function collectServiceUrls(value, out = new Set(), depth = 0) {
  if (depth > 8 || value == null) return out;
  if (typeof value === 'string') {
    const normalized = normalizeServiceUrl(value);
    if (normalized) out.add(normalized);
    return out;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectServiceUrls(entry, out, depth + 1);
    return out;
  }
  if (typeof value === 'object') {
    for (const entry of Object.values(value)) collectServiceUrls(entry, out, depth + 1);
  }
  return out;
}

function officialByHost(url) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return host.endsWith('.gov') || host.endsWith('.us');
  } catch {
    return false;
  }
}

export class ArcGISHubResolver {
  constructor({ http, maxItems = 12 } = {}) {
    this.http = http;
    this.maxItems = maxItems;
  }

  async resolveResults(results, jurisdiction) {
    const ids = [];
    const seen = new Set();
    for (const result of results || []) {
      const id = extractArcGisItemId(result.url);
      if (!id || seen.has(id)) continue;
      seen.add(id);
      ids.push({ id, result });
      if (ids.length >= this.maxItems) break;
    }

    const candidates = [];
    for (const entry of ids) {
      try {
        candidates.push(...await this.resolveItem(entry.id, jurisdiction, entry.result));
      } catch {
        // Discovery is best-effort. A stale/deleted Hub item should not abort
        // the broader GIS discovery run.
      }
    }
    return candidates;
  }

  async resolveItem(itemId, jurisdiction, result = {}) {
    const base = `https://www.arcgis.com/sharing/rest/content/items/${itemId}`;
    const item = await this.http.getJson(`${base}?f=json`);
    if (item.error) return [];

    const urls = new Set();
    const itemUrl = normalizeServiceUrl(item.url || '');
    if (itemUrl) urls.add(itemUrl);

    // Web Maps, Hub datasets, and other item types can reference one or more
    // backing map/feature services in their item data even when item.url is
    // not itself a REST service.
    if (!itemUrl || /web map|web mapping application|feature collection/i.test(item.type || '')) {
      try {
        const data = await this.http.getJson(`${base}/data?f=json`);
        collectServiceUrls(data, urls);
      } catch {
        // Some service items do not expose item-data. The direct item URL is
        // still useful when present.
      }
    }

    return [...urls].map((url) => {
      const candidate = {
        platform: 'arcgis',
        discoverySource: 'arcgis-hub-item',
        itemId,
        title: item.title || result.title || url,
        description: item.description || item.snippet || result.description || '',
        owner: item.owner || null,
        access: item.access || 'public',
        modified: item.modified ? new Date(item.modified).toISOString() : null,
        itemType: item.type || null,
        tags: item.tags || [],
        extent: item.extent || null,
        url,
        official: officialByHost(url)
      };
      const authority = sourceAuthorityScore(candidate, jurisdiction);
      return { ...candidate, freshness: sourceFreshness(candidate.modified), confidence: authority.score, confidenceReasons: authority.reasons };
    });
  }
}
