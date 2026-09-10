import { createEngine } from '../src/index.mjs';
import { normalizeResearchRequest, normalizeCodeSearchParams } from '../src/core/api-input.mjs';

const SECURITY_HEADERS = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'permissions-policy': 'camera=(), microphone=(), geolocation=()',
  'cross-origin-opener-policy': 'same-origin',
  'content-security-policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"
};

function secure(response) {
  const next = new Response(response.body, response);
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) next.headers.set(key, value);
  return next;
}

const json = (body, status = 200) => secure(new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
}));

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'property-zoning-research-edge', version:'0.2.0' });

    if (url.pathname === '/api/code-search' && request.method === 'GET') {
      let params;
      try { params = normalizeCodeSearchParams({ runId:url.searchParams.get('runId'), q:url.searchParams.get('q'), limit:url.searchParams.get('limit') || 20 }); }
      catch (error) { return json({ error:error.message }, 400); }
      const engine = createEngine(env);
      if (!engine.store?.enabled?.()) return json({ error:'Supabase persistence is not enabled' }, 409);
      try { return json({ results:await engine.store.searchDocumentSections(params.runId, params.q, params.limit) }); }
      catch (error) { return json({ error:error?.message || String(error) }, 500); }
    }

    if ((url.pathname === '/api/research' || url.pathname === '/api/research/stream') && request.method === 'POST') {
      const length = Number(request.headers.get('content-length') || 0);
      if (length > 16 * 1024) return json({ error:'request body too large' }, 413);
      const raw = await request.json().catch(() => null);
      if (!raw) return json({ error:'valid JSON body is required' }, 400);
      let body;
      try { body = normalizeResearchRequest(raw); }
      catch (error) { return json({ error:error.message }, 400); }
      const engine = createEngine(env);

      if (url.pathname === '/api/research/stream') {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const write = (value) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
            (async () => {
              try {
                const result = await engine.run(body.address, {
                  fetchOrdinanceDocuments: body.fetchOrdinanceDocuments,
                  maxGisCandidates: body.maxGisCandidates,
                  maxOrdinanceDocuments: body.maxOrdinanceDocuments,
                  onProgress: (event) => write(event)
                });
                write({ type:'result', ...result });
              } catch (error) {
                write({ type:'error', error:error?.message || String(error) });
              } finally { controller.close(); }
            })();
          }
        });
        return secure(new Response(stream, { headers:{ 'content-type':'application/x-ndjson; charset=utf-8', 'cache-control':'no-store' } }));
      }

      try {
        const result = await engine.run(body.address, {
          fetchOrdinanceDocuments: body.fetchOrdinanceDocuments,
          maxGisCandidates: body.maxGisCandidates,
          maxOrdinanceDocuments: body.maxOrdinanceDocuments
        });
        return json(result, 200);
      } catch (error) {
        return json({ error: error?.message || String(error) }, 500);
      }
    }

    if (url.pathname.startsWith('/api/')) return json({ error: 'not found' }, 404);
    if (env.ASSETS) return secure(await env.ASSETS.fetch(request));
    return json({ error: 'not found' }, 404);
  }
};
