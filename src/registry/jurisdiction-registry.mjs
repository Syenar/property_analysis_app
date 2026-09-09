function keyOf(j) {
  return [j.stateCode || j.state, j.countyCode || j.county, j.municipalityCode || j.municipality]
    .filter(Boolean).map((x) => String(x).trim().toLowerCase()).join('|');
}

export class MemoryJurisdictionRegistry {
  constructor(seed = []) {
    this.map = new Map();
    for (const row of seed) this.map.set(keyOf(row.jurisdiction), row);
  }
  async get(jurisdiction) { return this.map.get(keyOf(jurisdiction)) || null; }
  async put(jurisdiction, sources) {
    const current = this.map.get(keyOf(jurisdiction)) || {};
    const row = { ...current, jurisdiction, sources, verifiedAt: new Date().toISOString() };
    this.map.set(keyOf(jurisdiction), row);
    return row;
  }
  async markSuccess(jurisdiction) {
    const key = keyOf(jurisdiction);
    const row = this.map.get(key);
    if (!row) return null;
    row.lastSuccessAt = new Date().toISOString();
    this.map.set(key, row);
    return row;
  }
  async markFailure(jurisdiction) {
    const key = keyOf(jurisdiction);
    const row = this.map.get(key);
    if (!row) return null;
    row.lastFailureAt = new Date().toISOString();
    this.map.set(key, row);
    return row;
  }
}

export { keyOf as jurisdictionKey };
