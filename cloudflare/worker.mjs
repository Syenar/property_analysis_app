import { createEngine } from '../src/index.mjs';

const json = (body, status = 200) => new Response(JSON.stringify(body, null, 2), {
  status,
  headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }
});

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return json({ ok: true, service: 'property-zoning-research-edge' });
    if (url.pathname === '/api/code-search' && request.method === 'GET') {
      const runId = url.searchParams.get('runId');
      const q = url.searchParams.get('q');
      if (!runId || !q) return json({ error:'runId and q are required' }, 400);
      const engine = createEngine(env);
      if (!engine.store?.enabled?.()) return json({ error:'Supabase persistence is not enabled' }, 409);
      try { return json({ results:await engine.store.searchDocumentSections(runId,q,20) }); }
      catch (error) { return json({ error:error?.message || String(error) }, 500); }
    }
    if ((url.pathname === '/api/research' || url.pathname === '/api/research/stream') && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (!body.address) return json({ error: 'address is required' }, 400);
      const engine = createEngine(env);
      if (url.pathname === '/api/research/stream') {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
          start(controller) {
            const write = (value) => controller.enqueue(encoder.encode(`${JSON.stringify(value)}\n`));
            (async () => {
              try {
                const result = await engine.run(body.address, {
                  // Edge runtime indexes HTML/text; binary PDF extraction belongs in the Node document worker.
                  fetchOrdinanceDocuments: body.fetchOrdinanceDocuments === true,
                  maxGisCandidates: body.maxGisCandidates || 6,
                  onProgress: (event) => write(event)
                });
                write({ type:'result', ...result });
              } catch (error) {
                write({ type:'error', error:error?.message || String(error) });
              } finally { controller.close(); }
            })();
          }
        });
        return new Response(stream, { headers:{ 'content-type':'application/x-ndjson; charset=utf-8', 'cache-control':'no-store', 'x-content-type-options':'nosniff' } });
      }
      try {
        const result = await engine.run(body.address, {
          fetchOrdinanceDocuments: body.fetchOrdinanceDocuments === true,
          maxGisCandidates: body.maxGisCandidates || 6
        });
        return json(result, 200);
      } catch (error) {
        return json({ error: error?.message || String(error) }, 500);
      }
    }
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return json({ error: 'not found' }, 404);
  }
};
