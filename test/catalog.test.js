import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseSummary, joinModels, filterSort, detailLines } from '../src/catalog.js';

const text = readFileSync(new URL('../extensions/model-info/summary.json', import.meta.url), 'utf8');
const catalog = parseSummary(text);
const model = (id, provider = 'opencode-go') => ({ id, provider, name: id, contextWindow: 100000, maxTokens: 1000, reasoning: true, input: ['text', 'image'] });

test('bundled artifact and provenance match, with every entry retained', () => {
  assert.equal(catalog.entries.size, Object.keys(JSON.parse(text).scores.models).length);
  const meta = JSON.parse(readFileSync(new URL('../extensions/model-info/snapshot.json', import.meta.url)));
  assert.equal(createHash('sha256').update(text).digest('hex'), meta.sha256);
  assert.match(meta.revision, /^[a-f0-9]{40}$/);
});

test('exact provider/id joins never borrow scores across providers', () => {
  const id = [...catalog.entries.keys()][0].split('/').slice(1).join('/');
  const items = joinModels([model(id), model(id, 'other'), model('new/model')], catalog);
  assert.ok(items[0].info);
  assert.equal(items[1].info, undefined);
  assert.equal(items[2].key, 'opencode-go/new/model');
  assert.match(detailLines(items[1]).join('\n'), /No bundled/);
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
  for (const mutate of [d => { d.generatedAt = 'bad'; }, d => { d.scores.models = []; },
    d => { Object.values(d.scores.models)[0].coding.value = '0.5'; },
    d => { Object.values(d.scores.models)[0].coding.value = 2; },
    d => { Object.values(d.scores.models)[0].aa.bestIntelligence = undefined; },
    d => { Object.values(d.scores.models)[0].writing = {}; }]) {
    const data = JSON.parse(text); mutate(data); assert.throws(() => parseSummary(JSON.stringify(data)));
  }
  assert.throws(() => parseSummary('{'));
});
