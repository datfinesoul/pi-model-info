import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseSummary, metric, filterSort, rowDescription } from '../src/catalog.js';
const text = readFileSync(new URL('../extensions/model-info/summary.json', import.meta.url), 'utf8');
const data = JSON.parse(text);

test('AA index preserves every canonical source value independently of DeepSWE', () => {
  const catalog = parseSummary(text);
  const covered = new Set();
  for (const [key, route] of Object.entries(data.availability)) {
    const item = { key, model: {}, info: catalog.entries.get(key) };
    assert.equal(metric(item, 'coding-index'), data.models[route.modelKey]?.coding.value ?? null);
    if (metric(item, 'coding-index') !== null) covered.add(route.modelKey);
  }
  assert.ok(covered.size > 3);
});

test('AA sort retains zero, ties and missing rows without borrowing DeepSWE', () => {
  const items = [null, 0, 0.9, 0.9].map((value, i) => ({ key: `p/${i}`, model: { provider: 'p' },
    info: { coding: { value }, codingComparison: { result: { score: 0.742 } } } }));
  assert.deepEqual(filterSort(items, '', 'coding-index').map(item => item.key), ['p/2', 'p/3', 'p/1', 'p/0']);
  assert.match(rowDescription(items[0]), /AA n\/a.*DeepSWE 0.742/);
});
