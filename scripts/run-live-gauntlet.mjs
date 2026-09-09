import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createNodeEngine } from '../src/node.mjs';
import { loadEnvFile } from './env.mjs';

await loadEnvFile();
const cases = JSON.parse(await readFile(new URL('../tests/fixtures/gauntlet-addresses.json', import.meta.url), 'utf8'));
const engine = createNodeEngine(process.env);
const results = [];

for (const [index, c] of cases.entries()) {
  const started = Date.now();
  process.stdout.write(`[${index + 1}/${cases.length}] ${c.state} ${c.address} ... `);
  try {
    const { packet } = await engine.run(c.address, { fetchOrdinanceDocuments: false, maxGisCandidates: 5 });
    const row = {
      ...c,
      elapsedMs: Date.now() - started,
      geocoded: Boolean(packet.geocode?.ok),
      matchedAddress: packet.geocode?.matchedAddress || null,
      jurisdiction: packet.jurisdiction,
      parcelFound: Boolean(packet.parcel),
      parcelSource: packet.parcel?.sourceUrl || null,
      zoningFound: packet.zoning.length > 0,
      zoningSources: packet.zoning.map((z) => z.sourceUrl),
      ordinanceCandidates: packet.ordinanceSources.length,
      assessment: packet.assessment,
      warnings: packet.warnings
    };
    results.push(row);
    console.log(row.parcelFound ? (row.zoningFound ? 'PASS' : 'PARTIAL') : 'FAIL');
  } catch (error) {
    results.push({ ...c, elapsedMs: Date.now() - started, error: error.stack || String(error) });
    console.log('ERROR');
  }
}

const failureRows = results.filter((r) => !r.parcelFound || !r.zoningFound || r.error);
const summary = {
  generatedAt: new Date().toISOString(),
  total: results.length,
  geocoded: results.filter((r) => r.geocoded).length,
  parcelFound: results.filter((r) => r.parcelFound).length,
  zoningFound: results.filter((r) => r.zoningFound).length,
  parcelFailures: results.filter((r) => !r.parcelFound).length,
  zoningFailures: results.filter((r) => r.parcelFound && !r.zoningFound).length,
  errors: results.filter((r) => r.error).length
};
await mkdir('reports', { recursive: true });
await writeFile('reports/live-gauntlet.json', JSON.stringify({ summary, results }, null, 2));
const lines = ['# Live 20-state gauntlet', '', `Generated: ${summary.generatedAt}`, '', `- Total: ${summary.total}`, `- Geocoded: ${summary.geocoded}`, `- Parcel found: ${summary.parcelFound}`, `- Zoning found: ${summary.zoningFound}`, '', '| State | Address | Parcel | Zoning | Parcel source | Notes |', '|---|---|---:|---:|---|---|'];
for (const r of results) lines.push(`| ${r.state} | ${r.address.replace(/\|/g,'\\|')} | ${r.parcelFound ? 'yes' : 'no'} | ${r.zoningFound ? 'yes' : 'no'} | ${r.parcelSource || ''} | ${(r.error || (r.warnings || []).join('; ')).replace(/\|/g,'\\|').slice(0,500)} |`);
await writeFile('reports/live-gauntlet.md', lines.join('\n'));
const failureLines = ['# Live gauntlet failure report', '', `Generated: ${summary.generatedAt}`, '', failureRows.length ? `Failures/partials: ${failureRows.length}` : 'No parcel/zoning failures.', ''];
for (const r of failureRows) {
  failureLines.push(`## ${r.state} — ${r.address}`, '');
  failureLines.push(`- Geocoded: ${r.geocoded ? 'yes' : 'no'}`);
  failureLines.push(`- Parcel: ${r.parcelFound ? 'found' : 'missing'}`);
  failureLines.push(`- Zoning: ${r.zoningFound ? 'found' : 'missing'}`);
  if (r.parcelSource) failureLines.push(`- Parcel source: ${r.parcelSource}`);
  for (const w of r.warnings || []) failureLines.push(`- Warning: ${String(w)}`);
  if (r.error) failureLines.push(`- Error: ${String(r.error)}`);
  failureLines.push('');
}
await writeFile('reports/live-gauntlet-failures.md', failureLines.join('\n'));
console.log(JSON.stringify(summary, null, 2));
