export function normalizeText(text) {
  return String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/[\t\u00a0]+/g, ' ')
    .replace(/[ ]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function decodeBasicEntities(value) {
  return String(value || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

export function stripHtml(html) {
  return normalizeText(decodeBasicEntities(String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<(?:th|td)\b[^>]*>/gi, '')
    .replace(/<\/(?:th|td)>/gi, ' | ')
    .replace(/<\/(p|div|li|tr|h[1-6]|section|article)>/gi, '\n')
    .replace(/<li\b[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, ' ')));
}

const HEADING_PATTERNS = [
  /^§\s*[A-Za-z0-9.-]+(?:\s+.*)?$/,
  /^(?:section|sec\.)\s+[A-Za-z0-9.-]+(?:\s*[:.\-–—]\s*|\s+).+/i,
  /^(?:article|chapter|part|division|subchapter)\s+[A-Za-z0-9IVXLC.-]+(?:\s*[:.\-–—]\s*|\s+).*/i,
  /^\d{1,3}(?:\.\d+){1,4}\s+.{3,}$/,
  /^[A-Z]?\d{1,3}-\d{1,4}(?:\.\d+)?\s+.{3,}$/
];

export function looksLikeLegalHeading(line) {
  const value = String(line || '').trim();
  if (!value || value.length > 220) return false;
  return HEADING_PATTERNS.some((r) => r.test(value));
}

export function sectionize(text, { maxChars = 5000 } = {}) {
  const clean = normalizeText(text);
  if (!clean) return [];
  const lines = clean.split('\n').map((x) => x.trim()).filter(Boolean);
  const out = [];
  let heading = null;
  let body = [];

  const flush = () => {
    if (!heading && !body.length) return;
    const bodyText = body.join('\n').trim();
    if (heading || bodyText) out.push({ ordinal: out.length, heading, body: bodyText, text: [heading, bodyText].filter(Boolean).join('\n') });
    heading = null; body = [];
  };

  for (const line of lines) {
    if (looksLikeLegalHeading(line)) {
      flush();
      heading = line;
      continue;
    }
    const currentLength = body.reduce((n, x) => n + x.length + 1, 0);
    if (currentLength && currentLength + line.length > maxChars) flush();
    body.push(line);
  }
  flush();

  const chunked = [];
  for (const section of out) {
    if (section.text.length <= maxChars || section.heading) { chunked.push({ ...section, ordinal: chunked.length }); continue; }
    for (let i = 0; i < section.text.length; i += maxChars) {
      const bodyText = section.text.slice(i, i + maxChars).trim();
      if (bodyText) chunked.push({ ordinal: chunked.length, heading: null, body: bodyText, text: bodyText });
    }
  }
  return chunked;
}

export function keywordHits(text, terms = [
  'zoning', 'setback', 'yard', 'height', 'lot coverage', 'floor area ratio', 'density',
  'parking', 'permitted use', 'conditional use', 'special exception', 'variance', 'overlay'
]) {
  const lower = normalizeText(text).toLowerCase();
  return terms.filter((t) => lower.includes(t.toLowerCase()));
}

export function zoningIdentifiers(zoningRows = []) {
  const values = [];
  const seen = new Set();
  const keySignal = /(?:^|_)(?:zone|zoning|district|base.?zone|zone.?code|zonedesc|zone_desc)(?:$|_)/i;
  for (const row of zoningRows) {
    for (const feature of row.features || []) {
      const props = feature.properties || feature.attributes || {};
      for (const [key, value] of Object.entries(props)) {
        if (!keySignal.test(key) || typeof value !== 'string') continue;
        const normalized = value.trim().replace(/\s+/g, ' ');
        if (!normalized || normalized.length > 100 || seen.has(normalized.toLowerCase())) continue;
        seen.add(normalized.toLowerCase()); values.push(normalized);
      }
    }
  }
  return values.slice(0, 6);
}
