const DEFAULT_DENY_HOSTS = new Set([
  'qpublic.net',
  'www.qpublic.net',
  'beacon.schneidercorp.com'
]);

const DEFAULT_LINK_ONLY_SUFFIXES = [
  'qpublic.net',
  'beacon.schneidercorp.com'
];

const RESTRICTION_PATTERNS = [
  /automated\s+(?:access|collection|extraction|scraping)[^.!]{0,80}(?:prohibit|forbid|not\s+permitted|not\s+allowed)/i,
  /(?:robots?|scrapers?|crawlers?)[^.!]{0,80}(?:prohibit|forbid|not\s+permitted|not\s+allowed)/i,
  /do\s+not\s+(?:scrape|crawl|harvest|automate)/i,
  /request\s+permission[^.!]{0,100}(?:integrat|use|access|download)/i,
  /permission\s+(?:is\s+)?required[^.!]{0,100}(?:integrat|automated|reuse|redistribut)/i,
  /license\s+agreement[^.!]{0,100}(?:required|appl|govern)/i,
  /not\s+for\s+(?:automated\s+)?(?:integration|redistribution|commercial\s+reuse)/i,
  /cannot\s+be\s+(?:shared|redistributed|reused)[^.!]{0,100}(?:outside|without|unless)/i,
  /(?:use|using|reuse|redistribution|integration)[^.!]{0,120}expressly\s+unauthori[sz]ed/i,
  /unauthori[sz]ed[^.!]{0,120}(?:use|access|sharing|redistribution|integration)/i
];

const LIMITATION_PATTERNS = [
  { code: 'not-survey-grade', re: /(?:not|isn['’]?t)\s+(?:intended\s+to\s+be\s+|suitable\s+for\s+)?(?:a\s+)?(?:legal\s+)?survey|not\s+survey(?:ing)?\s+quality|not\s+survey[- ]grade/i },
  { code: 'general-reference-only', re: /(?:general|planning)\s+(?:reference|informational)\s+(?:purposes?|use)\s+only|for\s+reference\s+purposes?\s+only/i },
  { code: 'viewing-only', re: /(?:viewing|display|label(?:ing)?)\s+(?:and\s+label(?:ing)?\s+)?purposes?\s+only/i },
  { code: 'not-legal-reliance', re: /not\s+(?:intended|suitable)\s+for\s+(?:legal|engineering|survey|title)\s+(?:purposes?|determinations?|use)/i },
  { code: 'boundary-disclaimer', re: /(?:boundar(?:y|ies)|property\s+lines?)[^.!]{0,100}(?:approximate|not\s+authoritative|not\s+exact|should\s+not\s+be\s+relied)/i },
  { code: 'periodic-update', re: /updated\s+(?:annually|monthly|weekly|daily|quarterly|periodically)/i }
];

function metadataText(metadata = {}) {
  return [metadata.title,metadata.description,metadata.snippet,metadata.licenseInfo,metadata.license,metadata.copyrightText,metadata.terms,metadata.accessInformation].filter(Boolean).join(' ');
}

export function sourceLimitations(metadata = {}) {
  const text = metadataText(metadata);
  const limitations = [];
  for (const { code, re } of LIMITATION_PATTERNS) {
    const match = text.match(re);
    if (match) limitations.push({ code, excerpt: match[0].replace(/\s+/g, ' ').trim().slice(0, 220) });
  }
  return limitations;
}

export class SourcePolicy {
  constructor({ denyHosts = DEFAULT_DENY_HOSTS, allowHosts = [] } = {}) {
    this.denyHosts = new Set(denyHosts);
    this.allowHosts = new Set(allowHosts);
  }

  evaluate(url, { official = false, kind = 'unknown', ...metadata } = {}) {
    let host;
    try { host = new URL(url).hostname.toLowerCase(); } catch { return { action: 'deny', reason: 'invalid-url', limitations: [] }; }

    const limitations = sourceLimitations(metadata);
    if (this.denyHosts.has(host) || DEFAULT_LINK_ONLY_SUFFIXES.some((s) => host === s || host.endsWith(`.${s}`))) return { action: 'link-only', reason: 'automation-restricted-vendor-policy', limitations };
    const text = metadataText(metadata);
    if (RESTRICTION_PATTERNS.some((pattern) => pattern.test(text))) return { action: 'link-only', reason: 'source-metadata-requires-permission-or-restricts-automation', limitations };
    if (this.allowHosts.has(host)) return { action: 'fetch', reason: 'explicit-allowlist', limitations };
    if (official && (host.endsWith('.gov') || host.endsWith('.us'))) return { action: 'fetch', reason: 'official-government-source', limitations };
    if (/arcgis\.com$|arcgisonline\.com$/.test(host) || /FeatureServer|MapServer/.test(url)) return { action: 'fetch', reason: 'public-gis-api', limitations };
    if (kind === 'ordinance' && /(ecode360\.com|municode\.com|amlegal\.com)$/.test(host)) return { action: 'link-only', reason: 'third-party-code-provider-review-required', limitations };
    return { action: 'link-only', reason: 'unknown-third-party-terms', limitations };
  }

  decision(url, metadata = {}) { return this.evaluate(url, metadata); }
}
