const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const score = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
export const SORTS = ['name', 'coding', 'writing', 'intelligence'];
export const SORT_LABELS = { name: 'Name', coding: 'Coding (0–1)', writing: 'Writing (Elo)', intelligence: 'AA intelligence (index)' };

// Schema 1.0.0 separates canonical benchmarks from exact provider routes.
export function parseSummary(text) {
  const data = JSON.parse(text);
  if (!object(data) || data.schemaVersion !== '1.0.0' || typeof data.generatedAt !== 'string' ||
      !Number.isFinite(Date.parse(data.generatedAt)) || !object(data.models) || !object(data.availability)) {
    throw new Error('Invalid summary: expected schema 1.0.0, generatedAt, models and availability');
  }
  for (const [id, row] of Object.entries(data.models)) {
    if (!id.includes('/') || !object(row) || typeof row.name !== 'string' ||
        !object(row.coding) || !score(row.coding.value) || ![null, 'openRouter', 'official', 'selfReported'].includes(row.coding.signal) ||
        ((row.coding.value === null) !== (row.coding.signal === null)) ||
        (row.coding.value !== null && (row.coding.value < 0 || row.coding.value > 1)) ||
        !object(row.aa) || !score(row.aa.bestIntelligence) ||
        (row.writing !== null && (!object(row.writing) || !score(row.writing.elo)))) {
      throw new Error(`Invalid canonical model: ${id}`);
    }
  }
  const entries = new Map();
  for (const [key, route] of Object.entries(data.availability)) {
    if (!object(route) || typeof route.provider !== 'string' || !route.provider || typeof route.id !== 'string' || !route.id ||
        key !== `${route.provider}/${route.id}` ||
        (route.modelKey !== null && (typeof route.modelKey !== 'string' || !Object.hasOwn(data.models, route.modelKey))) ||
        (route.modelKey === null ? route.identitySource !== null : route.identitySource !== 'models-dev.canonical_model_id')) {
      throw new Error(`Invalid availability route: ${key}`);
    }
    entries.set(key, route.modelKey === null ? undefined : data.models[route.modelKey]);
  }
  return { generatedAt: data.generatedAt, entries };
}

export function joinModels(models, catalog) {
  return models.map(model => {
    const key = `${model.provider}/${model.id}`;
    return { key, model, info: catalog?.entries.get(key) };
  });
}

export function metric(item, mode) {
  if (mode === 'coding') return item.info?.coding.value ?? null;
  if (mode === 'writing') return item.info?.writing?.elo ?? null;
  if (mode === 'intelligence') return item.info?.aa.bestIntelligence ?? null;
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
const signals = { openRouter: 'OpenRouter / mirrored AA', official: 'ZeroEval third-party', selfReported: 'ZeroEval vendor-reported' };
export function detailLines(item) {
  if (!item) return ['No matching models'];
  const { model, info } = item;
  const lines = [`Context: ${tokens(model.contextWindow)} | Max output: ${tokens(model.maxTokens)}`,
    `Reasoning: ${model.reasoning ? 'yes' : 'no'} | Image input: ${model.input?.includes('image') ? 'yes' : 'no'}`];
  if (!info) return [...lines, '', 'No bundled benchmark information for this provider/model'];
  return [...lines, '',
    `Coding: ${value(info.coding.value)} (0–1) | ${signals[info.coding.signal] ?? 'no source'}`,
    `Writing: ${value(info.writing?.elo)} Elo | EQ-Bench Creative Writing v3`,
    `Intelligence: ${value(info.aa.bestIntelligence)} index | AA Free (best matched variant)`];
}
