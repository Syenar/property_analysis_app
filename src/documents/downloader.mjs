import { stripHtml, sectionize, keywordHits } from '../indexing/text-index.mjs';
import { sha256Hex } from '../core/hash.mjs';

export class DocumentDownloader {
  constructor({ http, policy, robots = null, pdfExtractor = null }) {
    this.http = http;
    this.policy = policy;
    this.robots = robots;
    this.pdfExtractor = pdfExtractor;
  }

  async fetchDocument(candidate) {
    const decision = candidate.automation || this.policy.decision(candidate.url, { official: candidate.official, kind: 'ordinance' });
    if (decision.action !== 'fetch') {
      return { url: candidate.url, fetched: false, policy: decision, title: candidate.title || null };
    }
    if (this.robots && !/\/(FeatureServer|MapServer)(?:\/|$)/i.test(candidate.url)) {
      const robots = await this.robots.decision(candidate.url);
      if (!robots.allowed) {
        return { url: candidate.url, fetched: false, policy: { action: 'link-only', reason: robots.reason, robots }, title: candidate.title || null };
      }
    }
    const response = await this.http.request(candidate.url, { headers: { Accept: 'text/html,text/plain,application/pdf,*/*' } });
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    const sourceModifiedAt = response.headers.get('last-modified') || null;
    const retrievedAt = new Date().toISOString();
    if (contentType.includes('text/html') || contentType.includes('text/plain') || contentType.includes('application/json')) {
      const rawText = await response.text();
      const text = contentType.includes('html') ? stripHtml(rawText) : rawText;
      const sections = sectionize(text);
      return {
        url: candidate.url,
        title: candidate.title || null,
        fetched: true,
        retrievedAt,
        sourceModifiedAt,
        contentType,
        policy: decision,
        bytes: new TextEncoder().encode(rawText).byteLength,
        sha256: await sha256Hex(rawText),
        text,
        sections,
        keywordHits: keywordHits(text),
        rawText
      };
    }
    const bytes = new Uint8Array(await response.arrayBuffer());
    const sha256 = await sha256Hex(bytes);
    if ((contentType.includes('application/pdf') || /\.pdf(?:$|\?)/i.test(candidate.url)) && this.pdfExtractor) {
      const extracted = await this.pdfExtractor(bytes);
      return {
        url: candidate.url,
        title: candidate.title || null,
        fetched: true,
        retrievedAt,
        sourceModifiedAt,
        contentType: contentType || 'application/pdf',
        policy: decision,
        bytes: bytes.byteLength,
        sha256,
        binary: bytes,
        text: extracted.text || null,
        sections: extracted.sections || [],
        keywordHits: extracted.keywordHits || []
      };
    }
    return {
      url: candidate.url,
      title: candidate.title || null,
      fetched: true,
      retrievedAt,
      sourceModifiedAt,
      contentType,
      policy: decision,
      bytes: bytes.byteLength,
      sha256,
      binary: bytes,
      text: null,
      sections: [],
      keywordHits: []
    };
  }
}
