import test from 'node:test';
import assert from 'node:assert/strict';
import { SupabaseRestStore } from '../src/storage/supabase-rest.mjs';

test('Supabase persistence obeys explicit enable flag', () => {
  const http = {};
  assert.equal(new SupabaseRestStore({ http, url: 'https://x.supabase.co', serviceRoleKey: 'secret', persistEnabled: false }).enabled(), false);
  assert.equal(new SupabaseRestStore({ http, url: 'https://x.supabase.co', serviceRoleKey: 'secret', persistEnabled: true }).enabled(), true);
});
