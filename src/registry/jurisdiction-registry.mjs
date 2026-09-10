function canonicalPlace(value) {
  return String(value || '').trim().toLowerCase()
    .replace(/\b(city|town|village|borough|municipality|cdp)\b/g, '')
    .replace(/\s+/g, ' ').trim();
}

function sameJurisdiction(a = {}, b = {}) {
  const stateA = canonicalPlace(a.state || a.stateCode);
  const stateB = canonicalPlace(b.state || b.stateCode);
  const muniA = canonicalPlace(a.municipality);
  const muniB = canonicalPlace(b.municipality);
  if (!stateA || !stateB || stateA !== stateB || !muniA || !muniB || muniA !== muniB) return false;
  return true;
}

function keyOf(j) {
  return [j.stateCode || j.state, j.countyCode || j.county, j.municipalityCode || j.municipality]
    .filter(Boolean).map((x) => String(x).trim().toLowerCase()).join('|');
}

export class MemoryJurisdictionRegistry {
  constructor(seed = []) {
    this.map = new Map();
    for (const row of seed) this.map.set(keyOf(row.jurisdiction), row);
  }
  async get(jurisdiction) {
    const exact = this.map.get(keyOf(jurisdiction));
    if (exact) return exact;
    for (const row of this.map.values()) if (sameJurisdiction(row.jurisdiction, jurisdiction)) return row;
    return null;
  }
  async put(jurisdiction, sources) {
    const current = this.map.get(keyOf(jurisdiction)) || {};
    const row = { ...current, jurisdiction, sources, verifiedAt: new Date().toISOString() };
    this.map.set(keyOf(jurisdiction), row);
    return row;
  }
  async markSuccess(jurisdiction) {
    const key = keyOf(jurisdiction);
    const row = this.map.get(key) || [...this.map.values()].find((x) => sameJurisdiction(x.jurisdiction, jurisdiction));
    if (!row) return null;
    row.lastSuccessAt = new Date().toISOString();
    this.map.set(keyOf(row.jurisdiction), row);
    return row;
  }
  async markFailure(jurisdiction) {
    const key = keyOf(jurisdiction);
    const row = this.map.get(key) || [...this.map.values()].find((x) => sameJurisdiction(x.jurisdiction, jurisdiction));
    if (!row) return null;
    row.lastFailureAt = new Date().toISOString();
    this.map.set(keyOf(row.jurisdiction), row);
    return row;
  }
}

export { keyOf as jurisdictionKey, canonicalPlace, sameJurisdiction };
