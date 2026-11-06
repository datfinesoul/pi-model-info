const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const score = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
export const SORTS = ['name', 'coding', 'writing'];
export const SORT_LABELS = { name: 'Name', coding: 'Coding (DeepSWE 1.1)', writing: 'Writing (AI-judged, 0–100)' };
export const CODING_NOTE = 'DeepSWE 1.1 · vendor-reported · max effort; compute/protocols may differ';
const aiWriting = row => row?.writingMeasurements?.aiWritingBenchmark?.metrics?.duelScore100;


// Schema 1.0.0 separates canonical benchmarks from exact provider routes.
export function parseSummary(text) {
  const data = JSON.parse(text);
  if (!object(data) || data.schemaVersion !== '1.0.0' || typeof data.generatedAt !== 'string' ||
      !Number.isFinite(Date.parse(data.generatedAt)) || !object(data.models) || !object(data.availability)) {
    throw new Error('Invalid summary: expected schema 1.0.0, generatedAt, models and availability');
  }
  if (!object(data.scores?.comparisonGroups)) throw new Error('Invalid summary: missing comparison groups');
  const groups = new Map();
  const validateMeasure = (measurement, field, mode, scaleId) => {
    if (!object(measurement) || !score(measurement[field])) throw new Error(`Invalid ${mode} measurement`);
    if (measurement[field] === null) return;
    const group = data.scores.comparisonGroups[measurement.comparisonGroupId];
    if (!object(group) || group.sortableWithinGroup !== true || group.metric !== (mode === 'coding' ? 'coding' : 'writing') ||
        group.scale?.id !== scaleId || measurement.scaleId !== scaleId ||
        (groups.has(mode) && groups.get(mode) !== measurement.comparisonGroupId)) {
      throw new Error(`Invalid or mixed ${mode} comparison groups`);
    }
    groups.set(mode, measurement.comparisonGroupId);
  };
  for (const [id, row] of Object.entries(data.models)) {
    if (!id.includes('/') || !object(row) || typeof row.name !== 'string' ||
        !object(row.coding) || !score(row.coding.value) || ![null, 'openRouter'].includes(row.coding.signal) ||
        ((row.coding.value === null) !== (row.coding.signal === null)) ||
        (row.coding.value !== null && (row.coding.value < 0 || row.coding.value > 1)) ||
        !object(row.aa) || !score(row.aa.bestIntelligence)) {
      throw new Error(`Invalid canonical model: ${id}`);
    }
    validateMeasure(row.coding, 'value', 'coding', 'openrouter-aa-coding-index-normalized-0-to-1');
    if (!Array.isArray(row.aa.bestIntelligenceVariants) || row.aa.bestIntelligenceVariants.some(variant =>
      !object(variant) || typeof variant.name !== 'string' || typeof variant.slug !== 'string' || variant.value !== row.aa.bestIntelligence)) {
      throw new Error(`Invalid intelligence variants: ${id}`);
    }
    const writing = aiWriting(row);
    if (row.writingMeasurements?.aiWritingBenchmark != null && writing === undefined) throw new Error(`Missing AI writing metric: ${id}`);
    if (writing !== undefined) {
      if (row.writingMeasurements.aiWritingBenchmark.source !== 'ai-writing-benchmark') throw new Error(`Invalid AI writing source: ${id}`);
      validateMeasure(writing, 'score', 'writing', 'ai-writing-benchmark-duel-score-100');
      if (writing.score !== null && (writing.score < 0 || writing.score > 100)) throw new Error(`Invalid AI writing score: ${id}`);
    }
  }
  if (!Array.isArray(data.scores.codingEvidence?.benchmarks)) throw new Error('Invalid coding evidence');
  const canonical = new Map(Object.entries(data.models).map(([id, row]) => [id, { ...row, codingEvidence: [], sourceMetadata: data.scores.sourceMetadata }]));
  for (const benchmark of data.scores.codingEvidence.benchmarks) {
    if (!object(benchmark) || typeof benchmark.benchmarkId !== 'string' || !Array.isArray(benchmark.results)) throw new Error('Invalid coding benchmark');
    for (const result of benchmark.results) {
      if (!object(result) || !canonical.has(result.modelKey) || !score(result.score) || !score(result.normalizedScore) ||
          typeof result.selfReported !== 'boolean' || typeof result.verified !== 'boolean') throw new Error('Invalid coding result');
      canonical.get(result.modelKey).codingEvidence.push({ benchmark, result, group: data.scores.comparisonGroups[result.comparisonGroupId] });
    }
  }
  const series = data.scores.codingComparisons?.find(series => series.seriesId === 'deepswe-1.1-max-published-effort');
  if (!object(series) || series.comparisonGroupId !== 'coding:deepswe-1.1:max-published-effort:vendor-reported:2026-11-05' ||
      series.sortableWithinGroup !== true || series.scale?.id !== 'deepswe-1.1-score-fraction-0-to-1' ||
      !Array.isArray(series.results) || !Array.isArray(series.limitations)) throw new Error('Invalid DeepSWE coding series');
  const seen = new Set();
  for (const result of series.results) {
    if (!object(result) || !canonical.has(result.modelKey) || seen.has(result.modelKey) ||
        result.comparisonGroupId !== series.comparisonGroupId || !score(result.score) ||
        (result.score !== null && (result.score < 0 || result.score > 1)) || typeof result.reasoningEffort !== 'string') {
      throw new Error('Invalid DeepSWE coding result');
    }
    seen.add(result.modelKey);
    canonical.get(result.modelKey).codingComparison = { series, result };
  }
  const entries = new Map();
  for (const [key, route] of Object.entries(data.availability)) {
    if (!object(route) || typeof route.provider !== 'string' || !route.provider || typeof route.id !== 'string' || !route.id ||
        key !== `${route.provider}/${route.id}` ||
        (route.modelKey !== null && (typeof route.modelKey !== 'string' || !Object.hasOwn(data.models, route.modelKey))) ||
        (route.modelKey === null ? route.identitySource !== null : route.identitySource !== 'models-dev.canonical_model_id')) {
      throw new Error(`Invalid availability route: ${key}`);
    }
    entries.set(key, route.modelKey === null ? undefined : canonical.get(route.modelKey));
  }
  return { generatedAt: data.generatedAt, entries };
}

export function joinModels(models, catalog) {
  return models.map(model => {
    const key = `${model.provider}/${model.id}`;
    return { key, model, info: catalog?.entries.get(key) };
  });
}

export function sortOptions() {
  return SORTS.map(id => ({ id, label: SORT_LABELS[id] }));
}

export function rowDescription(item) {
  const fields = [`[${item.model.provider}]`];
  for (const [id, label] of [['coding', 'Code'], ['writing', 'Writing']]) {
    const value = metric(item, id);
    fields.push(`${label} ${value ?? 'n/a'}`);
  }
  return fields.join('  ');
}

export function metric(item, mode) {
  if (mode === 'coding') return item.info?.codingComparison?.result.score ?? null;
  if (mode === 'writing') return aiWriting(item.info)?.score ?? null;
  return null;
}

export function filterSort(items, query, mode) {
  if (!SORTS.includes(mode)) throw new Error(`Unknown sort: ${mode}`);
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  return items.filter(item => terms.every(term => `${item.key} ${item.model.name ?? ''} ${item.info?.name ?? ''}`.toLowerCase().includes(term)))
    .sort((a, b) => {
      const av = metric(a, mode), bv = metric(b, mode);
      if (mode !== 'name') {
        if (av === null && bv !== null) return 1;
        if (bv === null && av !== null) return -1;
        if (av !== null && bv !== null && av !== bv) return bv - av;
      }
      return a.key.localeCompare(b.key);
    });
}

const value = (v) => v === null || v === undefined ? 'unknown' : String(v);
const tokens = (v) => Number.isFinite(v) ? v.toLocaleString('en-US') : 'unknown';

// Evidence is descriptive only. Different benchmarks never become a composite sort.
export function evidenceLines(item) {
  if (!item?.info) return ['No bundled benchmark information for this provider/model'];
  const info = item.info;
  const writing = info.writingMeasurements?.aiWritingBenchmark;
  const measure = aiWriting(info);
  const comparison = info.codingComparison;
  const lines = [item.key, '', 'CODING — DeepSWE 1.1, maximum published effort',
    `Score: ${value(comparison?.result.score)} (0–1) | Effort: ${value(comparison?.result.reasoningEffort)}`,
    ...(comparison ? [comparison.series.comparisonStatus, ...comparison.series.limitations,
      `Source: ${comparison.result.sourceEvidence?.sourceUrl ?? 'unknown'}`,
      `Comparison group: ${comparison.series.comparisonGroupId}`] : ['No result in this series. No fallback to another coding measurement.']),
    '', 'OTHER CODING EVIDENCE — OpenRouter-mirrored AA index',
    `Index: ${value(info.coding.value)} (0–1)`,
    `Source records: ${info.coding.sourceRecordIds?.join(', ') || 'none'}`,
    `Comparison group: ${value(info.coding.comparisonGroupId)}`,
    info.metricAvailability?.coding?.reason ?? 'Best matched OpenRouter variant; effort is not mapped to Pi.',
    '', 'ZEROEVAL — individual coding results, not a sortable average',
    'Shared IDs do not prove equal harnesses or reasoning effort.'];
  for (const { benchmark, result } of info.codingEvidence ?? []) {
    lines.push('', `${benchmark.name} [${benchmark.benchmarkId}]`,
      `Score: ${value(result.score)} / ${value(result.maxScore)} | Normalized: ${value(result.normalizedScore)}`,
      `Reporting: ${result.selfReported ? 'vendor-reported' : 'third-party'} | Verified: ${result.verified ? 'yes' : 'no'}`,
      `Conditions: ${result.analysisMethod ?? 'not recorded'}`,
      `Comparison group: ${value(result.comparisonGroupId)}`,
      `Source: ${result.sourceUrl ?? result.sourceSnapshot ?? 'not recorded'}`);
  }
  if (!info.codingEvidence?.length) lines.push('No ZeroEval coding results in this snapshot.');
  lines.push('', 'WRITING — AI Writing Benchmark (AI-judged)',
    `Score: ${value(measure?.score)} (0–100, not a percentage)`,
    '50 estimates an even chance against the average model in English.');
  if (writing) lines.push(`Variant: ${writing.sourceModelId}`,
    `Effort: ${writing.reasoningEffort} | Quantization: ${writing.quantization}`,
    `Published score interval: ${measure?.publishedScoreInterval?.join('–') ?? 'unknown'}`,
    `Comparisons: ${value(measure?.comparisons)}`,
    `Human score (separate): ${value(writing.humanMeasurement?.score)} | Comparisons: ${value(writing.humanMeasurement?.comparisons)}`,
    `Comparison group: ${value(measure?.comparisonGroupId)}`);
  else lines.push('No AI Writing Benchmark measurement matched. No Elo fallback.');
  lines.push('', 'SOURCE MATCHES', JSON.stringify(info.sourceMatches ?? {}), '', 'SOURCE METADATA', JSON.stringify(info.sourceMetadata ?? {}));
  return lines;
}

export function detailLines(item) {
  if (!item) return ['No matching models'];
  const { model } = item;
  return [`Context: ${tokens(model.contextWindow)} | Max output: ${tokens(model.maxTokens)}`,
    `Reasoning: ${model.reasoning ? 'yes' : 'no'} | Image input: ${model.input?.includes('image') ? 'yes' : 'no'}`];
}
