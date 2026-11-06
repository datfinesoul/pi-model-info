import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { parseSummary, joinModels, filterSort, detailLines, metric, evidenceLines, sortOptions, rowDescription } from '../src/catalog.js';

const text = readFileSync(new URL('../extensions/model-info/summary.json', import.meta.url), 'utf8');
const data = JSON.parse(text);
const catalog = parseSummary(text);
const model = (id, provider = 'github-copilot') => ({ id, provider, name: id, contextWindow: 100000, maxTokens: 1000, reasoning: true, input: ['text', 'image'] });
const selected = joinModels(['claude-opus-5.5', 'gpt-6-luna', 'gpt-6.1-sol'].map(id => model(id)), catalog);

test('artifact provenance and every route are retained', () => {
  const meta = JSON.parse(readFileSync(new URL('../extensions/model-info/snapshot.json', import.meta.url)));
  assert.equal(createHash('sha256').update(text).digest('hex'), meta.sha256);
  assert.deepEqual(meta.generatorFiles, data.generator.files);
  assert.equal(catalog.entries.size, Object.keys(data.availability).length);
});
const sourceArtifact = new URL('../../model-info/data/summary.json', import.meta.url);
test('source and bundle stay byte-identical in the ACP', { skip: !existsSync(sourceArtifact) }, () => {
  assert.equal(readFileSync(sourceArtifact, 'utf8'), text);
});

test('stable menu contains only Name, Coding and Writing in every scope', () => {
  for (const items of [selected, [], [{ key: 'p/new', model: {} }]]) {
    assert.deepEqual(sortOptions(items).map(option => option.id), ['name', 'coding', 'writing']);
  }
});

test('selected coding series uses exact published max-effort scores, not high-effort evidence', () => {
  assert.deepEqual(selected.map(item => metric(item, 'coding')), [0.742, 0.6659, 0.719]);
  assert.deepEqual(filterSort(selected, '', 'coding').map(item => item.model.id), ['claude-opus-5.5', 'gpt-6.1-sol', 'gpt-6-luna']);
  assert.notEqual(metric(selected[2], 'coding'), 0.7522);
  for (const item of selected) {
    assert.equal(item.info.coding.value, null);
    assert.match(evidenceLines(item).join('\n'), /not an overall coding score/);
  }
});

test('writing uses AI-judge series only, never Elo or human scores', () => {
  assert.deepEqual(selected.map(item => metric(item, 'writing')), [93.1, 79, 95.3]);
  assert.equal(metric({ info: { writing: { elo: 2050.9 } } }, 'writing'), null);
  assert.match(evidenceLines(selected[2]).join('\n'), /95.3/);
  assert.match(evidenceLines(selected[2]).join('\n'), /94.6–96/);
});

test('rows show both scores and no intelligence, while details stay compact', () => {
  assert.match(rowDescription(selected[0], 'name'), /Code 0.742.*Writing 93.1/);
  assert.doesNotMatch(rowDescription(selected[0], 'name'), /Intel|—/);
  assert.match(rowDescription({ model: model('new') }, 'coding'), /Code n\/a.*Writing n\/a/);
  assert.equal(detailLines(selected[0]).length, 2);
});

test('unknown coding never falls back to another index or ZeroEval mean', () => {
  const item = joinModels([model('gpt-5.6-luna', 'opencode-go')], catalog)[0];
  assert.equal(item.info.coding.value, 0.714);
  assert.equal(metric(item, 'coding'), null);
  const missing = joinModels([model('gpt-6.1-sol', 'other')], catalog)[0];
  assert.equal(missing.info, undefined);
});

test('every route preserves canonical identity, writing values and coding evidence', () => {
  const series = data.scores.codingComparisons.find(series => series.seriesId === 'deepswe-1.1-max-published-effort');
  for (const [key, route] of Object.entries(data.availability)) {
    const info = catalog.entries.get(key);
    if (route.modelKey === null) { assert.equal(info, undefined); continue; }
    const source = data.models[route.modelKey];
    const item = { key, model: model(route.id, route.provider), info };
    assert.equal(metric(item, 'coding'), series.results.find(result => result.modelKey === route.modelKey)?.score ?? null);
    assert.equal(metric(item, 'writing'), source.writingMeasurements?.aiWritingBenchmark?.metrics?.duelScore100?.score ?? null);
    const expected = data.scores.codingEvidence.benchmarks.flatMap(benchmark => benchmark.results.filter(result => result.modelKey === route.modelKey));
    assert.deepEqual(info.codingEvidence.map(entry => entry.result), expected);
  }
  assert.equal(catalog.entries.get('github-copilot/gpt-6-luna'), catalog.entries.get('opencode-go/gpt-6-luna'));
});

test('numeric sorts keep zero, unknowns, ties and filtering distinct', () => {
  const items = [null, 0, 0.9, 0.9].map((score, i) => ({ key: `p/${i}`, model: {}, info: { codingComparison: { result: { score } } } }));
  assert.deepEqual(filterSort(items, '', 'coding').map(item => item.key), ['p/2', 'p/3', 'p/1', 'p/0']);
  assert.equal(filterSort(items, 'P/2', 'coding').length, 1);
  assert.throws(() => filterSort(items, '', 'intelligence'));
});

test('invalid consumed contract fields fail closed even with unchanged schema version', () => {
  const mutations = [
    d => { d.schemaVersion = 'future'; },
    d => { d.generatedAt = 'bad'; },
    d => { delete d.scores.codingComparisons; },
    d => { d.scores.codingComparisons[0].comparisonGroupId = 'wrong'; },
    d => { d.scores.codingComparisons[0].results[0].comparisonGroupId = 'wrong'; },
    d => { d.scores.codingComparisons[0].results[0].score = 2; },
    d => { d.scores.codingComparisons[0].results.push(d.scores.codingComparisons[0].results[0]); },
    d => { d.scores.codingComparisons[0].scale.id = 'wrong'; },
    d => { d.models['openai/gpt-6.1-sol'].writingMeasurements.aiWritingBenchmark.metrics.duelScore100.score = '95'; },
    d => { d.models['openai/gpt-6.1-sol'].writingMeasurements.aiWritingBenchmark.metrics.duelScore100.comparisonGroupId = 'wrong'; },
    d => { Object.values(d.availability)[0].modelKey = 'missing/model'; },
  ];
  for (const mutate of mutations) {
    const copy = JSON.parse(text); mutate(copy);
    assert.throws(() => parseSummary(JSON.stringify(copy)));
  }
});
