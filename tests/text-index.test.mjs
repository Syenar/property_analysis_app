import test from 'node:test';
import assert from 'node:assert/strict';
import { stripHtml, sectionize, looksLikeLegalHeading, zoningIdentifiers } from '../src/indexing/text-index.mjs';

test('HTML tables retain readable cell boundaries', () => {
  const text = stripHtml('<table><tr><th>Zone</th><th>Height</th></tr><tr><td>R-2</td><td>35 ft</td></tr></table>');
  assert.match(text, /Zone\s*\|\s*Height/);
  assert.match(text, /R-2\s*\|\s*35 ft/);
});

test('legal sectionizer recognizes ordinance headings', () => {
  assert.equal(looksLikeLegalHeading('Section 17-203. Dimensional requirements'), true);
  const sections = sectionize('ARTICLE IV Residential Districts\nIntro text\nSection 17-203. Dimensional requirements\nMaximum height 35 feet.');
  assert.equal(sections.length, 2);
  assert.match(sections[1].heading, /17-203/);
  assert.match(sections[1].body, /35 feet/);
});

test('zoning identifiers are extracted only from zoning-like fields', () => {
  const ids = zoningIdentifiers([{features:[{properties:{ZONE:'R-2',DISTRICT:'Residential Two',OWNER:'Someone'}}]}]);
  assert.deepEqual(ids, ['R-2','Residential Two']);
});
