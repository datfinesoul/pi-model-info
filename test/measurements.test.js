import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import { parseSummary, metric } from '../src/catalog.js';
const summary = readFileSync(new URL('../extensions/model-info/summary.json', import.meta.url), 'utf8');
const measurements = readFileSync(new URL('../extensions/model-info/measurement-contract.json', import.meta.url), 'utf8');

test('summary alone supplies both comparisons and exact canonical routes', () => {
  const catalog = parseSummary(summary);
  assert.equal(metric({ info: catalog.entries.get('github-copilot/gpt-6.1-sol') }, 'coding'), 0.719);
  assert.equal(metric({ info: catalog.entries.get('other/gpt-6.1-sol') }, 'coding'), null);
});

test('malformed comparison contracts fail closed', () => {
  for (const mutate of [
    d => { delete d.consumerComparisons; },
    d => { d.consumerContractRevision = 'future'; },
    d => { d.consumerComparisons.coding.results.pop(); },
    d => { d.consumerComparisons.writing.results.push(d.consumerComparisons.writing.results[0]); },
    d => { d.consumerComparisons.coding.results[0].score = 0; },
    d => { d.consumerComparisons.coding.orderedModelKeys.reverse(); },
    d => { d.consumerComparisons.coding.coverage.measuredModelCount = 15; },
    d => { d.consumerComparisons.writing.results.find(r => r.score !== null).score = '95'; },
    d => { d.consumerComparisons.coding.results.find(r => r.score !== null).comparisonGroupId = 'wrong'; },
  ]) {
    const data = JSON.parse(summary); mutate(data);
    assert.throws(() => parseSummary(JSON.stringify(data)));
  }
});

test('legacy fields and sidecar series never select domain scores', () => {
  const data = JSON.parse(summary);
  for (const row of Object.values(data.models)) {
    if (row.coding.value !== null) row.coding.value = 0;
    const writing = row.writingMeasurements?.aiWritingBenchmark?.metrics?.duelScore100;
    if (writing) writing.score = 0;
  }
  const evidence = JSON.parse(measurements);
  evidence.series = [];
  const catalog = parseSummary(JSON.stringify(data), JSON.stringify(evidence));
  const item = { info: catalog.entries.get('github-copilot/gpt-6.1-sol') };
  assert.equal(metric(item, 'coding'), 0.719);
  assert.equal(metric(item, 'writing'), 95.3);
});

test('optional evidence artifact must match complete comparisons, not only revision', () => {
  assert.doesNotThrow(() => parseSummary(summary, measurements));
  const evidence = JSON.parse(measurements);
  evidence.consumerComparisons.coding.results[0].unavailableReason = 'different snapshot';
  assert.throws(() => parseSummary(summary, JSON.stringify(evidence)), /do not match/);
});
