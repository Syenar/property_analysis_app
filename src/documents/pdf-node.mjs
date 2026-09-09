// Node/server-only deterministic PDF text extraction. Keep this out of Cloudflare Worker bundles.
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { sectionize, normalizeText, keywordHits } from '../indexing/text-index.mjs';

const execFileAsync = promisify(execFile);

export async function extractPdfText(bytes) {
  const dir = await mkdtemp(join(tmpdir(), 'pzre-'));
  try {
    const pdf = join(dir, 'document.pdf');
    const txt = join(dir, 'document.txt');
    await writeFile(pdf, bytes);
    await execFileAsync('pdftotext', ['-layout', '-nopgbrk', pdf, txt], { timeout: 60000 });
    const text = normalizeText(await readFile(txt, 'utf8'));
    return { text, sections: sectionize(text), keywordHits: keywordHits(text) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
