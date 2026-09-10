import test from 'node:test';
import assert from 'node:assert/strict';
import { assertSafeRemoteUrl } from '../src/core/url-safety.mjs';
import { HttpClient } from '../src/core/http.mjs';

test('remote URL guard blocks localhost, private IPs and credentialed URLs', () => {
  for (const url of ['http://localhost/x','http://127.0.0.1/x','http://10.0.0.4/x','http://192.168.1.8/x','http://169.254.169.254/latest','https://user:pass@example.com/x']) {
    assert.throws(() => assertSafeRemoteUrl(url));
  }
  assert.equal(assertSafeRemoteUrl('https://gis.example.gov/arcgis/rest/services').hostname, 'gis.example.gov');
});

test('HttpClient validates redirect destinations before following them', async () => {
  const fetchFn = async () => new Response('', { status:302, headers:{ location:'http://127.0.0.1/private' } });
  const http = new HttpClient({ fetchFn, retries:0 });
  await assert.rejects(http.getText('https://example.gov/start'), /Private\/link-local remote host blocked/);
});

test('HttpClient can explicitly trust a configured local backend host without opening other private hosts', async () => {
  const seen = [];
  const fetchFn = async (url) => { seen.push(String(url)); return new Response('{}', { status:200, headers:{ 'content-type':'application/json' } }); };
  const http = new HttpClient({ fetchFn, retries:0, trustedHosts:['127.0.0.1'] });
  assert.deepEqual(await http.getJson('http://127.0.0.1:54321/rest/v1/test'), {});
  assert.equal(seen.length, 1);
  await assert.rejects(http.getJson('http://10.0.0.5/private'), /Private\/link-local remote host blocked/);
});
