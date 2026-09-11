import fs from 'node:fs';

function replaceOnce(path, before, after, label) {
  let s = fs.readFileSync(path, 'utf8');
  if (s.includes(after)) return;
  if (!s.includes(before)) throw new Error(`${label}: expected source text not found in ${path}`);
  s = s.replace(before, after);
  fs.writeFileSync(path, s);
}

replaceOnce('src/plans/blueprint-discovery.mjs',
`  constructor({ sourceDiscovery, arcgis, policy }) {
    this.sourceDiscovery = sourceDiscovery;
    this.arcgis = arcgis;
    this.policy = policy;
  }`,
`  constructor({ sourceDiscovery, arcgis, policy, archiveCatalog = null }) {
    this.sourceDiscovery = sourceDiscovery;
    this.arcgis = arcgis;
    this.policy = policy;
    this.archiveCatalog = archiveCatalog;
  }`, 'blueprint constructor');
replaceOnce('src/plans/blueprint-discovery.mjs', `    const webSources = [];
    let webSearchAvailable = true;`, `    const webSources = [];
    const webResults = [];
    let webSearchAvailable = true;`, 'blueprint web results');
replaceOnce('src/plans/blueprint-discovery.mjs',
`      const web = await this.sourceDiscovery.discoverOfficialWebSources(jurisdiction, 'blueprint', extraQueries, { signal });
      webSources.push(...web.map((r) => classifyWebCandidate(r, jurisdiction, address, ids, this.policy)).filter(Boolean));`,
`      const web = await this.sourceDiscovery.discoverOfficialWebSources(jurisdiction, 'blueprint', extraQueries, { signal });
      webResults.push(...web);
      webSources.push(...web.map((r) => classifyWebCandidate(r, jurisdiction, address, ids, this.policy)).filter(Boolean));`, 'blueprint capture results');
replaceOnce('src/plans/blueprint-discovery.mjs',
`    const sources = dedupe([...attachmentSources, ...webSources]);
    return {
      attempted:true,
      webSearchAvailable,
      sources,
      directDocumentCount:sources.filter((s) => s.directDocument).length,
      arcgisAttachmentCount:attachmentSources.length
    };`,
`    let archiveResearch = { attempted:false, webSearchAvailable, aliases:[], sources:[], archiveCatalogCount:0, archiveAssetCount:0, blockedCatalogCount:0, relatedRecordCount:0, libraryOfCongressCount:0 };
    if (this.archiveCatalog) {
      try { archiveResearch = await this.archiveCatalog.discover(jurisdiction, { address, parcel, seedResults:webResults, signal }); }
      catch (error) { rethrowIfAborted(error, signal); }
    }
    const sources = dedupe([...attachmentSources, ...webSources, ...(archiveResearch.sources || [])]);
    return {
      attempted:true,
      webSearchAvailable,
      sources,
      directDocumentCount:sources.filter((s) => s.directDocument).length,
      arcgisAttachmentCount:attachmentSources.length,
      archiveCatalogCount:Number(archiveResearch.archiveCatalogCount || 0),
      archiveAssetCount:Number(archiveResearch.archiveAssetCount || 0),
      blockedCatalogCount:Number(archiveResearch.blockedCatalogCount || 0),
      relatedRecordCount:Number(archiveResearch.relatedRecordCount || 0),
      libraryOfCongressCount:Number(archiveResearch.libraryOfCongressCount || 0),
      propertyAliases:archiveResearch.aliases || []
    };`, 'blueprint archive merge');

replaceOnce('src/index.mjs', `import { BlueprintDiscovery } from './plans/blueprint-discovery.mjs';`, `import { BlueprintDiscovery } from './plans/blueprint-discovery.mjs';
import { ArchiveCatalogDiscovery } from './plans/archive-catalog-discovery.mjs';`, 'archive import');
replaceOnce('src/index.mjs',
`  const ordinanceDiscovery = overrides.ordinanceDiscovery || new OrdinanceDiscovery({ sourceDiscovery: discovery, policy });
  const blueprintDiscovery = overrides.blueprintDiscovery || new BlueprintDiscovery({ sourceDiscovery: discovery, arcgis, policy });
  const robots = overrides.robots || new RobotsPolicy({ http });
  const documentDownloader = overrides.documentDownloader || new DocumentDownloader({ http, policy, robots });`,
`  const robots = overrides.robots || new RobotsPolicy({ http });
  const ordinanceDiscovery = overrides.ordinanceDiscovery || new OrdinanceDiscovery({ sourceDiscovery: discovery, policy });
  const archiveCatalog = overrides.archiveCatalog || new ArchiveCatalogDiscovery({ http, webSearch, policy, robots });
  const blueprintDiscovery = overrides.blueprintDiscovery || new BlueprintDiscovery({ sourceDiscovery: discovery, arcgis, policy, archiveCatalog });
  const documentDownloader = overrides.documentDownloader || new DocumentDownloader({ http, policy, robots });`, 'archive wiring');
if (!fs.readFileSync('src/index.mjs','utf8').includes("export * from './plans/archive-catalog-discovery.mjs';")) {
  replaceOnce('src/index.mjs', `export * from './policy/robots.mjs';`, `export * from './policy/robots.mjs';
export * from './plans/archive-catalog-discovery.mjs';`, 'archive export');
}

let h=fs.readFileSync('web/index.html','utf8');
h=h.replace('The app searches public permit/planning sources and address-matched ArcGIS attachments. A result is shown as a plan candidate unless the source metadata clearly identifies the document type.', 'The app searches public permit/planning systems, official archives and digital catalogs, Library of Congress records, and address/parcel-matched ArcGIS attachments. Confirmed archive records remain visible even when the archive blocks automated file downloads.');
fs.writeFileSync('web/index.html',h);
let a=fs.readFileSync('web/app.js','utf8');
a=a.replace("source.discoverySource==='arcgis-attachment'?'address/parcel-matched GIS attachment':source.matchEvidence?.queryScoped?'address-scoped search result':'property plan source'", "source.discoverySource==='arcgis-attachment'?'address/parcel-matched GIS attachment':source.discoverySource==='archive-catalog-asset'?'asset linked from official archive record':(source.catalogRecord||source.discoverySource==='archive-catalog'||source.discoverySource==='archive-related-record'||source.discoverySource==='library-of-congress')?(source.recordAccess==='blocked'?'official archive/catalog record · automated retrieval blocked — open official record':'official archive/catalog record'):(source.matchEvidence?.addressMatch||source.matchEvidence?.parcelIdMatch||source.matchEvidence?.propertyAliasMatch)?'property match evidence':source.matchEvidence?.queryScoped?'property-scoped search result':'property plan source'");
a=a.replace('Checking public permit, planning, and blueprint sources for property-specific plan documents.', 'Checking permit systems, official archives, digital catalogs, and public plan sources for property-specific drawings.');
fs.writeFileSync('web/app.js',a);

fs.writeFileSync('tests/archive-preview.test.mjs', `import test from 'node:test';
import assert from 'node:assert/strict';
import { ArchiveCatalogDiscovery } from '../src/plans/archive-catalog-discovery.mjs';
import { HttpError } from '../src/core/http.mjs';
import { SourcePolicy } from '../src/policy/source-policy.mjs';
test('blocked archive record stays visible as link-only plan source', async()=>{
 const http={getText:async()=>{throw new HttpError('blocked',{status:403,url:'https://azmemory.azlibrary.gov/nodes/view/236509'})},getJson:async()=>({results:[]})};
 const d=new ArchiveCatalogDiscovery({http,webSearch:{available:()=>false,search:async()=>[]},policy:new SourcePolicy(),robots:{decision:async()=>({allowed:true})}});
 const r=await d.discover({municipality:'Phoenix',county:'Maricopa County',state:'Arizona',candidates:[]},{address:'1700 W WASHINGTON ST, PHOENIX, AZ, 85007',seedResults:[{title:"Architect's plan for the Arizona State Capitol in Phoenix",description:'Arizona Capitol Architectural drawings (visual works)',url:'https://azmemory.azlibrary.gov/nodes/view/236509',discoveryScope:'extra',queryScoped:true}]});
 const x=r.sources.find(v=>v.url.endsWith('/236509')); assert.ok(x); assert.equal(x.recordAccess,'blocked'); assert.equal(x.automation.action,'link-only');
});
`);
console.log('Archive/catalog preview patch applied');
