import { mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { createNodeEngine } from '../src/node.mjs';
import { loadEnvFile } from './env.mjs';

await loadEnvFile();
const address = process.argv.slice(2).join(' ').trim();
if (!address) {
  console.error('Usage: node scripts/research-address.mjs "200 E Colfax Ave, Denver, CO 80203"');
  process.exit(2);
}

const engine = createNodeEngine(process.env);
const result = await engine.run(address);
const slug = createHash('sha1').update(address).digest('hex').slice(0, 10);
const out = `output/${slug}`;
await mkdir(out, { recursive: true });
await writeFile(`${out}/research-packet.json`, JSON.stringify(result.packet, null, 2));
await writeFile(`${out}/research-packet.md`, result.markdown);
console.log(JSON.stringify({ output: out, warnings: result.packet.warnings.length, parcel: Boolean(result.packet.parcel), zoningSources: result.packet.zoning.length }, null, 2));
