import test from 'node:test';
import assert from 'node:assert/strict';
import { parseRobots, RobotsPolicy } from '../src/policy/robots.mjs';

test('robots parser groups wildcard rules', () => {
  const groups = parseRobots('User-agent: *\nDisallow: /private/\nAllow: /private/public/\n');
  assert.equal(groups.length, 1);
  assert.equal(groups[0].rules.length, 2);
});

test('robots policy uses longest matching allow/disallow rule', async () => {
  const http = { getText: async () => ({ text: 'User-agent: *\nDisallow: /docs/\nAllow: /docs/public/\n', response: { url: 'https://example.gov/robots.txt' } }) };
  const policy = new RobotsPolicy({ http });
  assert.equal((await policy.decision('https://example.gov/docs/private.pdf')).allowed, false);
  assert.equal((await policy.decision('https://example.gov/docs/public/code.pdf')).allowed, true);
});
