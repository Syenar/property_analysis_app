import fs from 'node:fs';

const path = 'src/plans/archive-catalog-discovery.mjs';
let s = fs.readFileSync(path, 'utf8');

if (!s.includes('function harvestedAddressQueries(')) {
  const helper = [
    'function harvestedAddressQueries(address, jurisdiction = {}) {',
    "  const original = String(address || '').replace(/\\s+/g, ' ').trim();",
    '  if (!original) return [];',
    '  const noZip = original',
    "    .replace(/\\b\\d{5}(?:-\\d{4})?\\b/g, ' ')",
    "    .replace(/[;,]+/g, ' ')",
    "    .replace(/\\s+/g, ' ')",
    '    .trim();',
    "  const compact = noZip.replace(/\\s+,\\s+/g, ' ').replace(/,/g, ' ').replace(/\\s+/g, ' ').trim();",
    "  const directionMap = { N:'North', S:'South', E:'East', W:'West', NE:'Northeast', NW:'Northwest', SE:'Southeast', SW:'Southwest' };",
    "  const suffixMap = { ST:'Street', AVE:'Avenue', AV:'Avenue', RD:'Road', BLVD:'Boulevard', DR:'Drive', LN:'Lane', CT:'Court', PL:'Place', PKWY:'Parkway', HWY:'Highway', TER:'Terrace', CIR:'Circle', TRL:'Trail', WAY:'Way' };",
    '  let expanded = compact;',
    "  for (const [abbr, word] of Object.entries(directionMap)) expanded = expanded.replace(new RegExp('\\\\b' + escapeRegex(abbr) + '\\\\b', 'gi'), word);",
    "  for (const [abbr, word] of Object.entries(suffixMap)) expanded = expanded.replace(new RegExp('\\\\b' + escapeRegex(abbr) + '\\\\b', 'gi'), word);",
    "  const state = String(jurisdiction?.state || '').trim();",
    "  const statePostal = String(jurisdiction?.stateAbbreviation || jurisdiction?.statePostal || '').trim();",
    "  if (state && statePostal) expanded = expanded.replace(new RegExp('\\\\b' + escapeRegex(statePostal) + '\\\\b', 'gi'), state);",
    '  const rows = [original, compact, expanded].filter(Boolean);',
    '  const seen = new Set();',
    '  return rows.filter((row) => {',
    '    const key = normalize(row);',
    '    if (!key || seen.has(key)) return false;',
    '    seen.add(key);',
    '    return true;',
    '  });',
    '}',
    '',
    ''
  ].join('\n');
  const anchor = 'function freshAnonymousId() {';
  if (!s.includes(anchor)) throw new Error('archive normalization helper anchor missing');
  s = s.replace(anchor, helper + anchor);
}

if (!s.includes('const identityQueries = harvestedAddressQueries(address, jurisdiction);')) {
  const re = /      const identityRows = await this\.searchHarvestedCatalog\(provider, address, \{ signal, pageSize:Math\.max\(20, provider\.harvestedCatalog\.pageSize \|\| 30\) \}\);\n      succeeded = true;\n      for \(const result of identityRows\) \{\n        const evidence = addressEvidence\(`\$\{result\.title \|\| ''\} \$\{result\.description \|\| ''\}`, address\);\n        if \(!evidence\.matched\) continue;\n        const alias = catalogIdentityAlias\(result\.title, jurisdiction\);\n        if \(!alias\) continue;\n        foundAliases\.push\(\{ value:alias, source:result\.url, confidence:96, providerId:provider\.id \}\);\n      \}/;
  const replacement = [
    '      const identityQueries = harvestedAddressQueries(address, jurisdiction);',
    '      for (const identityQuery of identityQueries) {',
    '        const identityRows = await this.searchHarvestedCatalog(provider, identityQuery, { signal, pageSize:Math.max(20, provider.harvestedCatalog.pageSize || 30) });',
    '        succeeded = true;',
    '        for (const result of identityRows) {',
    "          const evidence = addressEvidence(`${result.title || ''} ${result.description || ''}`, address);",
    '          if (!evidence.matched) continue;',
    '          const alias = catalogIdentityAlias(result.title, jurisdiction);',
    '          if (!alias) continue;',
    '          foundAliases.push({ value:alias, source:result.url, confidence:96, providerId:provider.id });',
    '        }',
    '        if (foundAliases.length) break;',
    '      }'
  ].join('\n');
  const next = s.replace(re, replacement);
  if (next === s) throw new Error('archive identity-query anchor missing');
  s = next;
}

if (!s.includes('for (const addressQuery of harvestedAddressQueries(address, jurisdiction).slice(0, 2))')) {
  const old = [
    '      // An address-scoped plan query remains useful when the catalog metadata itself contains the street address.',
    "      for (const term of (provider.planTerms || ['architectural drawings']).slice(0, 2)) {",
    '        const query = `${address} ${term}`;',
    '        const key = normalize(query);',
    '        if (!seenQueries.has(key)) { seenQueries.add(key); planQueries.push(query); }',
    '      }'
  ].join('\n');
  const replacement = [
    '      // Address-scoped plan queries remain useful when the catalog metadata itself contains the street address.',
    '      for (const addressQuery of harvestedAddressQueries(address, jurisdiction).slice(0, 2)) {',
    "        for (const term of (provider.planTerms || ['architectural drawings']).slice(0, 2)) {",
    '          const query = `${addressQuery} ${term}`;',
    '          const key = normalize(query);',
    '          if (!seenQueries.has(key)) { seenQueries.add(key); planQueries.push(query); }',
    '        }',
    '      }'
  ].join('\n');
  if (!s.includes(old)) throw new Error('archive address-plan anchor missing');
  s = s.replace(old, replacement);
}

s = s.replace(
  '  planSignal, normalize, cleanedTitle, addressEvidence, propertyAliasesFromParcel, aliasEvidence,',
  '  planSignal, normalize, cleanedTitle, addressEvidence, harvestedAddressQueries, propertyAliasesFromParcel, aliasEvidence,'
);
fs.writeFileSync(path, s);

const testPath = 'tests/archive-preview.test.mjs';
let t = fs.readFileSync(testPath, 'utf8');
if (!t.includes('normalized address catalog identity discovers all three Phoenix Capitol plan records')) {
  t += `\n\ntest('normalized address catalog identity discovers all three Phoenix Capitol plan records', async()=>{\n const address='1700 W WASHINGTON ST, PHOENIX, AZ, 85007';\n const planRows=[236509,236514,236520].map((node)=>({title:\"Architect's plan for the Arizona State Capitol in Phoenix\",publicationDate:'1900',materialTabs:[{availability:{urls:['https://azmemory.azlibrary.gov/nodes/view/'+node],recordIds:[String(node)]},description:\"Photograph of an architect's plan for the Arizona State Capitol in Phoenix (Ariz.)\"}]}));\n const identity={title:'Arizona State Capitol building in Phoenix, Arizona',materialTabs:[{availability:{urls:['https://azmemory.azlibrary.gov/nodes/view/64963']},description:'Arizona State Capitol Building at 1700 W. Washington Street in Phoenix, Arizona, ca. 1950.'}]};\n const calls=[];\n const http={async getJson(url,options={}){if(String(url).includes('iiivega.com')){const q=JSON.parse(options.body).searchText;calls.push(q);if(q===address)return {data:[{title:'Unrelated exact-query result',materialTabs:[]}]};if(q==='1700 W WASHINGTON ST PHOENIX AZ')return {data:[identity]};if(/Arizona State Capitol/i.test(q)&&/architectural drawings|architect plan|blueprint|building plans|floor plan/i.test(q))return {data:planRows};return {data:[]};}if(String(url).includes('loc.gov'))return {results:[]};throw new Error('unexpected URL '+url);},async getText(){throw new Error('Arizona Memory direct fetch should not be needed');}};\n const d=new ArchiveCatalogDiscovery({http,webSearch:{available:()=>false,search:async()=>[]},policy:new SourcePolicy(),robots:{decision:async()=>({allowed:true})}});\n const r=await d.discover({municipality:'Phoenix city',county:'Maricopa County',state:'Arizona',stateCode:'04',candidates:[]},{address});\n const urls=r.sources.map(x=>x.url);\n assert.ok(urls.some(u=>u.endsWith('/236509')));\n assert.ok(urls.some(u=>u.endsWith('/236514')));\n assert.ok(urls.some(u=>u.endsWith('/236520')));\n assert.ok(calls.includes('1700 W WASHINGTON ST PHOENIX AZ'));\n assert.ok(calls.some(q=>/Arizona State Capitol/i.test(q)&&/architectural drawings|architect plan/i.test(q)));\n});\n`;
  fs.writeFileSync(testPath, t);
}

console.log('Archive address normalization patch applied.');
