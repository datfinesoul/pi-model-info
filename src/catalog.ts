const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const score = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
export const SORTS = ['name', 'coding-index', 'coding', 'writing'];
export const SORT_LABELS = { name: 'Name', 'coding-index': 'Coding index (AA, 0–1)', coding: 'DeepSWE max effort (0–1)', writing: 'Writing (AI-judged, 0–100)' };
export const CODING_NOTE = 'AA index and DeepSWE are separate measures · effort and compute differ';
const aiWriting = row => row?.writingMeasurements?.aiWritingBenchmark?.metrics?.duelScore100;


// Schema 1.0.0 separates canonical benchmarks from exact provider routes.
export function parseSummary(text, measurementText) {
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
  const comparisons = parseComparisons(data, canonical);
  if (measurementText !== undefined) {
    const evidence = JSON.parse(measurementText);
    if (evidence.consumerContractRevision !== data.consumerContractRevision ||
        JSON.stringify(evidence.consumerComparisons) !== JSON.stringify(data.consumerComparisons)) {
      throw new Error('Summary and evidence comparisons do not match');
    }
  }
  for (const [mode, comparison] of Object.entries(comparisons)) {
    for (const result of comparison.results) canonical.get(result.modelKey)[`${mode}Comparison`] = { comparison, result };
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

export function parseComparisons(data, models) {
  if (data.consumerContractRevision !== 'consumer-comparisons-1' || !object(data.consumerComparisons)) {
    throw new Error('Unsupported consumer comparison contract');
  }
  for (const mode of ['coding', 'writing']) {
    const c = data.consumerComparisons[mode];
    if (!object(c) || typeof c.comparisonId !== 'string' || typeof c.comparisonGroupId !== 'string' ||
        c.scoreDirection !== 'higher-is-better' || !Array.isArray(c.results) ||
        !Array.isArray(c.orderedModelKeys) || !Array.isArray(c.limitations) || !object(c.scale) ||
        !object(c.selectionPolicy) || !object(c.evaluationConditions) || c.label !== (mode === 'coding' ? 'Coding' : 'Writing') ||
        c.scale.minimum !== 0 || c.scale.maximum !== (mode === 'coding' ? 1 : 100) ||
        !['measurementLabel', 'methodology', 'missingValuePolicy', 'orderingPolicy'].every(k => typeof c[k] === 'string')) {
      throw new Error(`Invalid ${mode} comparison`);
    }
    const seen = new Set(), measured = new Map();
    for (const r of c.results) {
      if (!object(r) || !models.has(r.modelKey) || seen.has(r.modelKey) || !score(r.score) ||
          !Array.isArray(r.sourceRecordIds) ||
          (r.score === null ? r.comparisonGroupId !== null || typeof r.unavailableReason !== 'string' :
            r.comparisonGroupId !== c.comparisonGroupId || r.score < 0 ||
            r.score > (mode === 'coding' ? 1 : 100))) throw new Error(`Invalid ${mode} result`);
      seen.add(r.modelKey);
      if (r.score !== null) measured.set(r.modelKey, r.score);
    }
    const ordered = c.orderedModelKeys;
    if (seen.size !== models.size || ordered.length !== measured.size || new Set(ordered).size !== ordered.length ||
        ordered.some((key, i) => !measured.has(key) || (i > 0 && measured.get(ordered[i - 1]) < measured.get(key))) ||
        c.coverage?.catalogModelCount !== models.size || c.coverage.measuredModelCount !== measured.size) {
      throw new Error(`Invalid ${mode} coverage or order`);
    }
  }
  return data.consumerComparisons;
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
  for (const [id, label] of [['coding-index', 'AA'], ['coding', 'DeepSWE'], ['writing', 'Writing']]) {
    const value = metric(item, id);
    fields.push(`${label} ${value === null ? 'n/a' : id !== 'writing' ? Number(value.toFixed(4)) : value}`);
  }
  return fields.join('  ');
}

export function metric(item, mode) {
  if (mode === 'coding-index') return item.info?.coding?.value ?? null;
  if (mode === 'coding' || mode === 'writing') return item.info?.[`${mode}Comparison`]?.result.score ?? null;
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

const value = (v) => v === null || v === undefined ? 'n/a' : String(v);
const tokens = (v) => Number.isFinite(v) ? v.toLocaleString('en-US') : 'unknown';

function comparisonLines(entry) {
  if (!entry) return ['Comparison unavailable'];
  const { comparison: c, result: r } = entry;
  return ['', `${c.label.toUpperCase()} — ${c.measurementLabel}`,
    `Score: ${value(r.score)} (${c.label === 'Coding' ? '0–1 fraction' : '0–100, not a percentage'})`,
    ...(r.score === null ? [r.unavailableReason] : []),
    c.methodology, `Selection policy: ${JSON.stringify(c.selectionPolicy)}`, c.missingValuePolicy, c.orderingPolicy,
    `Conditions: ${JSON.stringify(c.evaluationConditions)}`,
    ...c.limitations,
    `Coverage: ${c.coverage.measuredModelCount}/${c.coverage.catalogModelCount} models`,
    `Comparison: ${c.comparisonId} | Group: ${c.comparisonGroupId}`,
    `Effort: ${value(r.effort)}`,
    `Uncertainty: ${r.uncertainty === null ? r.uncertaintyUnavailableReason ?? 'unavailable, not certainty' : JSON.stringify(r.uncertainty)}`,
    `Source records: ${r.sourceRecordIds.join(', ') || 'none'}`,
    `Provenance: ${JSON.stringify(r.provenance)}`];
}

// Evidence is descriptive only. Different benchmarks never become a composite sort.
export function evidenceLines(item) {
  if (!item?.info) return ['No bundled benchmark information for this provider/model'];
  const info = item.info;
  const writing = info.writingComparison?.result.provenance;
  const measure = writing?.metrics?.duelScore100;
  const lines = [item.key, ...comparisonLines(info.codingComparison),
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
  lines.push(...comparisonLines(info.writingComparison));
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
