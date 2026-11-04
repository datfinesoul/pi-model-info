const object = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const score = (v) => v === null || (typeof v === 'number' && Number.isFinite(v));
export const SORTS = ['name', 'coding', 'writing', 'intelligence'];
export const SORT_LABELS = { name: 'Name', coding: 'Coding (0–1)', writing: 'Writing (Elo)', intelligence: 'AA intelligence (index)' };

// Validate only the existing summary fields consumed by this extension.
export function parseSummary(text) {
  const data = JSON.parse(text);
  if (!object(data) || typeof data.generatedAt !== 'string' || !Number.isFinite(Date.parse(data.generatedAt)) || !object(data.scores?.models)) {
    throw new Error('Invalid summary: expected generatedAt and scores.models');
  }
  const entries = new Map();
  for (const [id, row] of Object.entries(data.scores.models)) {
    if (!id || !object(row) || typeof row.pi?.provider !== 'string' || !row.pi.provider || typeof row.name !== 'string' ||
        !object(row.coding) || !score(row.coding.value) || ![null, 'openRouter', 'official', 'selfReported'].includes(row.coding.signal) ||
        (row.coding.value !== null && (row.coding.value < 0 || row.coding.value > 1 || row.coding.signal === null)) ||
        !object(row.aa) || !score(row.aa.bestIntelligence) ||
        (row.writing !== null && (!object(row.writing) || !score(row.writing.elo)))) {
      throw new Error(`Invalid summary entry: ${id}`);
    }
    entries.set(`${row.pi.provider}/${id}`, row);
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
  const lines = [item.key, `Context: ${tokens(model.contextWindow)} | Max output: ${tokens(model.maxTokens)}`,
    `Reasoning: ${model.reasoning ? 'yes' : 'no'} | Image input: ${model.input?.includes('image') ? 'yes' : 'no'}`];
  if (!info) return [...lines, 'No bundled benchmark information for this provider/model'];
  return [...lines,
    `Coding: ${value(info.coding.value)} (0–1) | ${signals[info.coding.signal] ?? 'no source'}`,
    `Writing: ${value(info.writing?.elo)} Elo | EQ-Bench Creative Writing v3`,
    `Intelligence: ${value(info.aa.bestIntelligence)} index | AA Free (best matched variant)`,
    'Scores use different scales; they are not a composite or effort-specific rating.'];
}
