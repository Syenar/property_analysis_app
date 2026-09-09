const ENDPOINT = 'https://geocoding.geo.census.gov/geocoder/geographies/onelineaddress';

function firstGeo(geographies, names) {
  for (const name of names) {
    const rows = geographies?.[name];
    if (Array.isArray(rows) && rows.length) return rows[0];
  }
  return null;
}

export class CensusGeocoder {
  constructor({ http, benchmark = 'Public_AR_Current', vintage = 'Current_Current' }) {
    this.http = http;
    this.benchmark = benchmark;
    this.vintage = vintage;
  }

  async geocode(address) {
    const url = new URL(ENDPOINT);
    url.searchParams.set('address', address);
    url.searchParams.set('benchmark', this.benchmark);
    url.searchParams.set('vintage', this.vintage);
    url.searchParams.set('format', 'json');
    const raw = await this.http.getJson(url.toString());
    const matches = raw?.result?.addressMatches || [];
    if (!matches.length) return { ok: false, address, raw, reason: 'NO_CENSUS_MATCH' };
    const match = matches[0];
    const geos = match.geographies || {};
    const state = firstGeo(geos, ['States']);
    const county = firstGeo(geos, ['Counties']);
    const incorporated = firstGeo(geos, ['Incorporated Places', 'Consolidated Cities']);
    const countySubdivision = firstGeo(geos, ['County Subdivisions']);
    const censusPlace = firstGeo(geos, ['Census Designated Places']);
    const municipality = incorporated || countySubdivision || censusPlace;
    const jurisdictionCandidates = [
      incorporated && { name: incorporated.NAME, type: 'incorporated-place', geoid: incorporated.GEOID || null, lsadc: incorporated.LSADC || null, priority: 100 },
      countySubdivision && { name: countySubdivision.NAME, type: 'county-subdivision', geoid: countySubdivision.GEOID || null, lsadc: countySubdivision.LSADC || null, priority: 80 },
      censusPlace && { name: censusPlace.NAME, type: 'census-designated-place', geoid: censusPlace.GEOID || null, lsadc: censusPlace.LSADC || null, priority: 45 },
      match.addressComponents?.city && { name: match.addressComponents.city, type: 'mailing-city', geoid: null, lsadc: null, priority: 35 }
    ].filter(Boolean).filter((row, i, rows) => rows.findIndex((x) => String(x.name).toLowerCase() === String(row.name).toLowerCase()) === i);
    return {
      ok: true,
      inputAddress: address,
      matchedAddress: match.matchedAddress,
      coordinates: { longitude: match.coordinates.x, latitude: match.coordinates.y, srid: 4326 },
      components: match.addressComponents || {},
      jurisdiction: {
        state: state?.NAME || match.addressComponents?.state || null,
        stateCode: state?.GEOID || state?.STATE || null,
        county: county?.NAME || null,
        countyCode: county?.GEOID || null,
        municipality: municipality?.NAME || match.addressComponents?.city || null,
        municipalityType: incorporated ? 'incorporated-place' : countySubdivision ? 'county-subdivision' : censusPlace ? 'census-designated-place' : 'mailing-city',
        municipalityLsadc: municipality?.LSADC || null,
        municipalityCode: municipality?.GEOID || null,
        mailingCity: match.addressComponents?.city || null,
        candidates: jurisdictionCandidates
      },
      tigerLine: match.tigerLine || null,
      raw
    };
  }
}
