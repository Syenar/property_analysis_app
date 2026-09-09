// Node/server entry point. Adds deterministic PDF text extraction via pdftotext.
import { HttpClient } from './core/http.mjs';
import { SourcePolicy } from './policy/source-policy.mjs';
import { RobotsPolicy } from './policy/robots.mjs';
import { DocumentDownloader } from './documents/downloader.mjs';
import { extractPdfText } from './documents/pdf-node.mjs';
import { createEngine } from './index.mjs';

export function createNodeEngine(env = process.env, overrides = {}) {
  const http = overrides.http || new HttpClient();
  const policy = overrides.policy || new SourcePolicy();
  const robots = overrides.robots || new RobotsPolicy({ http });
  const documentDownloader = overrides.documentDownloader || new DocumentDownloader({ http, policy, robots, pdfExtractor: extractPdfText });
  return createEngine(env, { ...overrides, http, policy, documentDownloader });
}

export { extractPdfText } from './documents/pdf-node.mjs';
