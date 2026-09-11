import { readFile, writeFile } from 'node:fs/promises';

const path='src/plans/archive-catalog-discovery.mjs';
let source=await readFile(path,'utf8');

const helper=`function harvestedAddressQueries(address, jurisdiction = {}) {
  const original = String(address || '').replace(/\\s+/g, ' ').trim();
  if (!original) return [];
  const noZip = original
    .replace(/\\b\\d{5}(?:-\\d{4})?\\b/g, ' ')
    .replace(/[;,]+/g, ' ')
    .replace(/\\s+/g, ' ')
    .trim();
  const compact = noZip.replace(/\\s+,\\s+/g, ' ').replace(/,/g, ' ').replace(/\\s+/g, ' ').trim();
  const directionMap = { N:'North', S:'South', E:'East', W:'West', NE:'Northeast', NW:'Northwest', SE:'Southeast', SW:'Southwest' };
  const suffixMap = { ST:'Street', AVE:'Avenue', AV:'Avenue', RD:'Road', BLVD:'Boulevard', DR:'Drive', LN:'Lane', CT:'Court', PL:'Place', PKWY:'Parkway', HWY:'Highway', TER:'Terrace', CIR:'Circle', TRL:'Trail', WAY:'Way' };
  let expanded = compact;
  for (const [abbr, word] of Object.entries(directionMap)) expanded = expanded.replace(new RegExp('\\\\b' + abbr + '\\\\b', 'gi'), word);
  for (const [abbr, word] of Object.entries(suffixMap)) expanded = expanded.replace(new RegExp('\\\\b' + abbr + '\\\\b', 'gi'), word);
  const state = String(jurisdiction?.state || '').trim();
  const statePostal = String(jurisdiction?.stateAbbreviation || jurisdiction?.statePostal || '').trim();
  if (state && statePostal) expanded = expanded.replace(new RegExp('\\\\b' + escapeRegex(statePostal) + '\\\\b', 'gi'), state);
  const rows = [original, compact, expanded].filter(Boolean);
  const seen = new Set();
  return rows.filter((row) => {
    const key = normalize(row);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

`;
if(!source.includes('function harvestedAddressQueries(')){
  const anchor='function freshAnonymousId() {';
  if(!source.includes(anchor)) throw new Error('address normalization helper anchor missing');
  source=source.replace(anchor,helper+anchor);
}

const oldIdentity=`      const identityRows = await this.searchHarvestedCatalog(provider, address, { signal, pageSize:Math.max(20, provider.harvestedCatalog.pageSize || 30) });
      succeeded = true;
      for (const result of identityRows) {
        const evidence = addressEvidence(\`${'${result.title || \'\'}'} ${'${result.description || \'\'}'}\`, address);
        if (!evidence.matched) continue;
        const alias = catalogIdentityAlias(result.title, jurisdiction);
        if (!alias) continue;
        foundAliases.push({ value:alias, source:result.url, confidence:96, providerId:provider.id });
      }
`;
const newIdentity=`      const identityQueries = harvestedAddressQueries(address, jurisdiction);
      for (const identityQuery of identityQueries) {
        const identityRows = await this.searchHarvestedCatalog(provider, identityQuery, { signal, pageSize:Math.max(20, provider.harvestedCatalog.pageSize || 30) });
        succeeded = true;
        for (const result of identityRows) {
          const evidence = addressEvidence(\`${'${result.title || \'\'}'} ${'${result.description || \'\'}'}\`, address);
          if (!evidence.matched) continue;
          const alias = catalogIdentityAlias(result.title, jurisdiction);
          if (!alias) continue;
          foundAliases.push({ value:alias, source:result.url, confidence:96, providerId:provider.id });
        }
        if (foundAliases.length) break;
      }
`;
if(!source.includes(newIdentity)){
  if(!source.includes(oldIdentity)) throw new Error('identity query anchor missing');
  source=source.replace(oldIdentity,newIdentity);
}

const oldAddress=`      // An address-scoped plan query remains useful when the catalog metadata itself contains the street address.
      for (const term of (provider.planTerms || ['architectural drawings']).slice(0, 2)) {
        const query = \`${'${address}'} ${'${term}'}\`;
        const key = normalize(query);
        if (!seenQueries.has(key)) { seenQueries.add(key); planQueries.push(query); }
      }
`;
const newAddress=`      // Address-scoped plan queries remain useful when the catalog metadata itself contains the street address.
      for (const addressQuery of harvestedAddressQueries(address, jurisdiction).slice(0, 2)) {
        for (const term of (provider.planTerms || ['architectural drawings']).slice(0, 2)) {
          const query = \`${'${addressQuery}'} ${'${term}'}\`;
          const key = normalize(query);
          if (!seenQueries.has(key)) { seenQueries.add(key); planQueries.push(query); }
        }
      }
`;
if(!source.includes(newAddress)){
  if(!source.includes(oldAddress)) throw new Error('address plan query anchor missing');
  source=source.replace(oldAddress,newAddress);
}

await writeFile(path,source);
console.log('Harvested archive address normalization patch applied.');
