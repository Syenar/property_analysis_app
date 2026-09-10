import { sourceAuthorityScore } from '../confidence/scoring.mjs';

function trimSlash(value) { return String(value || '').replace(/\/+$/, ''); }

export function arcgisDirectoryRoot(input) {
  try {
    const u = new URL(input);
    const marker = u.pathname.match(/^(.*\/arcgis\/rest\/services)(?:\/.*)?$/i)
      || u.pathname.match(/^(.*\/server\/rest\/services)(?:\/.*)?$/i)
      || u.pathname.match(/^(.*\/rest\/services)(?:\/.*)?$/i);
    if (!marker) return null;
    u.pathname = marker[1];
    u.search = '';
    u.hash = '';
    return trimSlash(u.toString());
  } catch {
    return null;
  }
}

function serviceUrl(root, name, type) {
  const encoded = String(name || '').split('/').map(encodeURIComponent).join('/');
  return `${trimSlash(root)}/${encoded}/${type}`;
}

function purposeSignal(name, purpose) {
  const text = String(name || '').toLowerCase();
  if (purpose === 'parcel') return /parcel|cadastre|cadastral|tax.?lot|property|assessor/.test(text);
  return /zoning|zone|land.?use|planning/.test(text);
}

export class ArcGISDirectoryDiscovery {
  constructor({ http, maxFolders = 16, maxDepth = 2 } = {}) {
    this.http = http;
    this.maxFolders = maxFolders;
    this.maxDepth = maxDepth;
  }

  async readDirectory(url) {
    const base = trimSlash(url);
    const u = new URL(base);
    u.searchParams.set('f', 'pjson');
    const data = await this.http.getJson(u.toString());
    return { url: base, data };
  }

  async discoverFromRoots(roots, jurisdiction, purpose) {
    const queue = [];
    const seen = new Set();
    const out = [];
    for (const root of roots.map(arcgisDirectoryRoot).filter(Boolean)) queue.push({ url: root, depth: 0, folderName: '' });

    let foldersVisited = 0;
    while (queue.length && foldersVisited < this.maxFolders) {
      const current = queue.shift();
      if (!current || seen.has(current.url)) continue;
      seen.add(current.url);
      foldersVisited++;
      let data;
      try { ({ data } = await this.readDirectory(current.url)); }
      catch { continue; }

      for (const service of data.services || []) {
        if (!/^(FeatureServer|MapServer)$/i.test(service.type || '')) continue;
        const name = service.name || '';
        if (!purposeSignal(name, purpose)) continue;
        const url = serviceUrl(arcgisDirectoryRoot(current.url) || current.url, name, service.type);
        let host = '';
        try { host = new URL(url).hostname.toLowerCase(); } catch {}
        const candidate = {
          platform: 'arcgis',
          discoverySource: 'arcgis-rest-directory',
          title: name,
          description: `Discovered from ArcGIS REST directory ${current.url}`,
          url,
          official: host.endsWith('.gov') || host.endsWith('.us'),
          access: 'public',
          itemType: service.type
        };
        const authority = sourceAuthorityScore(candidate, jurisdiction);
        out.push({ ...candidate, lifecycle: authority.lifecycle, confidence: authority.score, confidenceReasons: authority.reasons });
      }

      if (current.depth >= this.maxDepth) continue;
      for (const folder of (data.folders || []).slice(0, this.maxFolders)) {
        const relevant = purposeSignal(folder, purpose) || /public|external|planning|gis|maps/i.test(folder);
        if (!relevant && current.depth > 0) continue;
        const root = arcgisDirectoryRoot(current.url) || current.url;
        queue.push({ url: `${root}/${encodeURIComponent(folder)}`, depth: current.depth + 1, folderName: folder });
      }
    }

    const byUrl = new Map();
    for (const item of out) {
      const existing = byUrl.get(item.url);
      if (!existing || item.confidence > existing.confidence) byUrl.set(item.url, item);
    }
    return [...byUrl.values()].sort((a, b) => b.confidence - a.confidence);
  }
}
