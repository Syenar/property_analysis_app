import { sourceAuthorityScore } from '../confidence/scoring.mjs';

const CODE_PROVIDER_RE = /(ecode360\.com|municode\.com|amlegal\.com)/i;

export class OrdinanceDiscovery {
  constructor({ sourceDiscovery, policy }) {
    this.sourceDiscovery = sourceDiscovery;
    this.policy = policy;
  }

  async discover(jurisdiction, { zoningIdentifiers = [] } = {}) {
    const place = [jurisdiction.municipality, jurisdiction.county, jurisdiction.state].filter(Boolean).join(' ');
    const extraQueries = zoningIdentifiers.slice(0, 3).map((zone) => `${place} ${JSON.stringify(zone)} zoning ordinance`);
    const results = await this.sourceDiscovery.discoverOfficialWebSources(jurisdiction, 'ordinance', extraQueries);
    return results.map((r) => {
      let host = '';
      try { host = new URL(r.url).hostname.toLowerCase(); } catch {}
      const official = host.endsWith('.gov') || host.endsWith('.us');
      const codeProvider = CODE_PROVIDER_RE.test(host);
      const authority = sourceAuthorityScore({ ...r, description: `${r.description || ''} zoning ordinance code` }, jurisdiction);
      const decision = this.policy.decision(r.url, { official, kind: 'ordinance' });
      return {
        ...r,
        official,
        codeProvider,
        confidence: Math.min(100, authority.score + (official ? 20 : codeProvider ? 10 : 0)),
        confidenceReasons: authority.reasons,
        automation: decision
      };
    }).sort((a, b) => b.confidence - a.confidence);
  }
}
