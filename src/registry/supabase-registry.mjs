import { jurisdictionKey } from './jurisdiction-registry.mjs';

export class SupabaseJurisdictionRegistry {
  constructor({ store, fallback = null }) {
    this.store = store;
    this.fallback = fallback;
  }

  async get(jurisdiction) {
    const key = jurisdictionKey(jurisdiction);
    if (!this.store?.enabled?.()) return this.fallback?.get?.(jurisdiction) || null;
    try {
      const row = await this.store.selectOne('jurisdiction_sources', { registry_key: key });
      if (!row) return this.fallback?.get?.(jurisdiction) || null;
      return {
        jurisdiction: row.jurisdiction,
        sources: row.sources,
        verifiedAt: row.verified_at,
        lastSuccessAt: row.last_success_at,
        lastFailureAt: row.last_failure_at
      };
    } catch {
      return this.fallback?.get?.(jurisdiction) || null;
    }
  }

  async put(jurisdiction, sources) {
    const row = {
      registry_key: jurisdictionKey(jurisdiction),
      jurisdiction,
      sources,
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };
    if (this.store?.enabled?.()) {
      try {
        const result = await this.store.upsert('jurisdiction_sources', row, 'registry_key');
        return result?.[0] || row;
      } catch {}
    }
    return this.fallback?.put?.(jurisdiction, sources) || row;
  }

  async markSuccess(jurisdiction) {
    const timestamp = new Date().toISOString();
    if (this.store?.enabled?.()) {
      try {
        const rows = await this.store.patch('jurisdiction_sources', { registry_key: jurisdictionKey(jurisdiction) }, { last_success_at: timestamp, updated_at: timestamp });
        if (rows?.[0]) return rows[0];
      } catch {}
    }
    return this.fallback?.markSuccess?.(jurisdiction) || null;
  }

  async markFailure(jurisdiction) {
    const timestamp = new Date().toISOString();
    if (this.store?.enabled?.()) {
      try {
        const rows = await this.store.patch('jurisdiction_sources', { registry_key: jurisdictionKey(jurisdiction) }, { last_failure_at: timestamp, updated_at: timestamp });
        if (rows?.[0]) return rows[0];
      } catch {}
    }
    return this.fallback?.markFailure?.(jurisdiction) || null;
  }
}
