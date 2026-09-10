import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, normalize } from 'node:path';
import { createNodeEngine } from '../src/node.mjs';
import { loadEnvFile } from './env.mjs';
import { normalizeResearchRequest, normalizeCodeSearchParams } from '../src/core/api-input.mjs';

await loadEnvFile();
const port = Number(process.env.PORT || 8787);
const root = new URL('../web/', import.meta.url);
const engine = createNodeEngine(process.env);
const types = { '.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml' };
const security = { 'x-content-type-options':'nosniff','referrer-policy':'no-referrer','permissions-policy':'camera=(), microphone=(), geolocation=()','cross-origin-opener-policy':'same-origin','content-security-policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'" };

function send(res, status, body, type='application/json; charset=utf-8') { res.writeHead(status, {'content-type':type,'cache-control':'no-store',...security}); res.end(body); }

http.createServer(async (req,res)=>{
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname === '/api/health') return send(res,200,JSON.stringify({ok:true,service:'property-zoning-research-local'}));
  if (url.pathname === '/api/code-search' && req.method === 'GET') {
    let params;
    try { params=normalizeCodeSearchParams({runId:url.searchParams.get('runId'),q:url.searchParams.get('q'),limit:url.searchParams.get('limit')||20}); }
    catch(error){ return send(res,400,JSON.stringify({error:error.message})); }
    if (!engine.store?.enabled?.()) return send(res,409,JSON.stringify({error:'Supabase persistence is not enabled'}));
    try { return send(res,200,JSON.stringify({results:await engine.store.searchDocumentSections(params.runId,params.q,params.limit)})); }
    catch(error){ return send(res,500,JSON.stringify({error:error.message||String(error)})); }
  }
  if ((url.pathname === '/api/research' || url.pathname === '/api/research/stream') && req.method === 'POST') {
    let raw=''; for await (const chunk of req) { raw += chunk; if (raw.length > 16*1024) return send(res,413,JSON.stringify({error:'request body too large'})); }
    let parsed; try{parsed=JSON.parse(raw||'{}');}catch{return send(res,400,JSON.stringify({error:'valid JSON body is required'}));}
    let body; try{body=normalizeResearchRequest(parsed);}catch(error){return send(res,400,JSON.stringify({error:error.message}));}
    if (url.pathname === '/api/research/stream') {
      res.writeHead(200, {'content-type':'application/x-ndjson; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});
      const write = (value) => res.write(`${JSON.stringify(value)}\n`);
      try {
        const result=await engine.run(body.address,{
          fetchOrdinanceDocuments:body.fetchOrdinanceDocuments,
          maxGisCandidates:body.maxGisCandidates,
          maxOrdinanceDocuments:body.maxOrdinanceDocuments,
          onProgress:(event)=>write(event)
        });
        write({type:'result',...result});
      } catch(error) { write({type:'error',error:error.message||String(error)}); }
      return res.end();
    }
    try { const result=await engine.run(body.address,{fetchOrdinanceDocuments:body.fetchOrdinanceDocuments,maxGisCandidates:body.maxGisCandidates,maxOrdinanceDocuments:body.maxOrdinanceDocuments}); return send(res,200,JSON.stringify(result)); }
    catch(error){ return send(res,500,JSON.stringify({error:error.message||String(error)})); }
  }
  let pathname = url.pathname === '/' ? '/index.html' : url.pathname;
  pathname = normalize(pathname).replace(/^([.][.][/\\])+/, '');
  try { const bytes=await readFile(new URL(`.${pathname}`,root)); return send(res,200,bytes,types[extname(pathname)]||'application/octet-stream'); }
  catch { return send(res,404,'Not found','text/plain; charset=utf-8'); }
}).listen(port,()=>console.log(`Property Research local UI: http://localhost:${port}`));
