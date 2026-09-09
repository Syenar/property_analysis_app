import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRestStore } from '../src/storage/supabase-rest.mjs';

test('document search uses server-side Supabase RPC', async () => {
  let seen = null;
  const http = { request: async (url, options) => {
    seen = {url,options};
    return new Response(JSON.stringify([{heading:'Parking',body:'Two spaces per dwelling',rank:0.7}]), {status:200,headers:{'content-type':'application/json'}});
  }};
  const store = new SupabaseRestStore({http,url:'https://project.supabase.co',serviceRoleKey:'secret',persistEnabled:true});
  const rows = await store.searchDocumentSections('00000000-0000-0000-0000-000000000001','parking',10);
  assert.equal(rows[0].heading,'Parking');
  assert.match(seen.url,/search_document_sections/);
  assert.deepEqual(JSON.parse(seen.options.body),{p_run_id:'00000000-0000-0000-0000-000000000001',p_query:'parking',p_limit:10});
});
