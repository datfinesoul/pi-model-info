import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseSummary, joinModels, filterSort, detailLines } from '../src/catalog.js';

const text = readFileSync(new URL('../extensions/model-info/summary.json', import.meta.url), 'utf8');
const catalog = parseSummary(text);
const model = (id, provider = 'opencode-go') => ({ id, provider, name: id, contextWindow: 100000, maxTokens: 1000, reasoning: true, input: ['text', 'image'] });

test('bundled artifact and provenance match, with every entry retained', () => {
  assert.equal(catalog.entries.size, Object.keys(JSON.parse(text).availability).length);
  const meta = JSON.parse(readFileSync(new URL('../extensions/model-info/snapshot.json', import.meta.url)));
  assert.equal(createHash('sha256').update(text).digest('hex'), meta.sha256);
  assert.match(meta.revision, /^[a-f0-9]{40}$/);
});

test('verified routes share Luna benchmarks without guessing other providers', () => {
  const items = joinModels([model('gpt-5.6-luna'), model('gpt-5.6-luna', 'github-copilot'),
    model('gpt-5.6-luna', 'other'), model('iceman-contributor-free'), model('new/model')], catalog);
  assert.equal(items[0].info.coding.value, 0.714);
  assert.equal(items[0].info.writing.elo, 1831.5);
  assert.equal(items[0].info, items[1].info);
  assert.equal(items[2].info, undefined);
  assert.equal(items[3].info, undefined);
  assert.equal(items[4].key, 'opencode-go/new/model');
  assert.match(detailLines(items[2]).join('\n'), /No bundled/);
  assert.match(detailLines(items[0]).join('\n'), /100,000/);
});

test('numeric sorts descend, unknowns sort last, ties use stable keys', () => {
  const items = [null, 0, 0.9, 0.9].map((value, i) => ({ key: `p/${i}`, model: {}, info: { coding: { value } } }));
  assert.deepEqual(filterSort(items, '', 'coding').map(x => x.key), ['p/2', 'p/3', 'p/1', 'p/0']);
  assert.deepEqual(items.map(x => x.key), ['p/0', 'p/1', 'p/2', 'p/3']);
  assert.deepEqual(filterSort(items, 'P/2', 'name').map(x => x.key), ['p/2']);
  assert.equal(filterSort(items, 'missing', 'name').length, 0);
});

test('writing Elo and intelligence use source values without rescaling', () => {
  const items = [{ key: 'p/a', model: {}, info: { writing: { elo: 1500 }, aa: { bestIntelligence: 20 } } },
    { key: 'p/b', model: {}, info: { writing: null, aa: { bestIntelligence: 50 } } }];
  assert.equal(filterSort(items, '', 'writing')[0].key, 'p/a');
  assert.equal(filterSort(items, '', 'intelligence')[0].key, 'p/b');
});

test('invalid consumed fields fail validation instead of inventing values', () => {
  for (const mutate of [d => { d.generatedAt = 'bad'; }, d => { d.models = []; },
    d => { d.schemaVersion = 'future'; },
    d => { Object.values(d.models)[0].coding.value = '0.5'; },
    d => { Object.values(d.models)[0].coding.value = 2; },
    d => { Object.values(d.models)[0].aa.bestIntelligence = undefined; },
    d => { Object.values(d.models)[0].writing = {}; },
    d => { Object.values(d.availability)[0].modelKey = 'missing/model'; },
    d => { Object.values(d.availability)[0].provider = 'wrong'; }]) {
    const data = JSON.parse(text); mutate(data); assert.throws(() => parseSummary(JSON.stringify(data)));
  }
  assert.throws(() => parseSummary('{'));
});
