import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const roots = ['src', 'scripts', 'tests', 'cloudflare'];
const files = [];

async function walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile() && full.endsWith('.mjs')) files.push(full);
  }
}

for (const root of roots) await walk(root);

const failures = [];
for (const file of files.sort()) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) failures.push({ file, output: `${result.stdout || ''}${result.stderr || ''}`.trim() });
}

if (failures.length) {
  for (const failure of failures) console.error(`\n${failure.file}\n${failure.output}`);
  process.exit(1);
}

console.log(`Syntax OK: ${files.length} .mjs files`);
