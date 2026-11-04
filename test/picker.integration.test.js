import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { test } from 'node:test';
const entry = process.env.PI_CODING_AGENT_ENTRY;

test('installed Pi: load, search, sort, scope, resize, switch and cancel', { skip: !entry && 'Set PI_CODING_AGENT_ENTRY to installed Pi dist/index.js' }, async () => {
  const require = createRequire(entry);
  const { createJiti } = await import(require.resolve('jiti'));
  const tuiPath = require.resolve('@earendil-works/pi-tui');
  const jiti = createJiti(import.meta.url, { alias: { '@earendil-works/pi-coding-agent': entry, '@earendil-works/pi-tui': tuiPath } });
  const { visibleWidth, matchesKey, Key } = await import(tuiPath);
  const { default: extension } = await jiti.import('../extensions/model-info/index.ts');
  const models = ['deepseek-v4-pro', 'beam-free', 'unknown'].map(id => ({ provider: 'opencode-go', id, name: id, contextWindow: 100000, maxTokens: 1000, reasoning: true, input: ['text'] }));
  let command, switched, factoryCalled = false;
  const notices = [];
  extension({ registerCommand(name, value) { assert.equal(name, 'models'); command = value; }, async setModel(model) { switched = model; return true; } });
  const ctx = {
    mode: 'tui', hasUI: true, scopedModels: [], modelRegistry: { getAvailable: () => models },
    ui: { notify: (...args) => notices.push(args), async custom(factory) {
      factoryCalled = true;
      const tui = { terminal: { rows: 24 }, requestRender() {} };
      const theme = { fg: (_, s) => s };
      const keys = { matches: (data, action) => matchesKey(data, ({ 'tui.input.tab': Key.tab, 'tui.select.up': Key.up, 'tui.select.down': Key.down, 'tui.select.confirm': Key.enter, 'tui.select.cancel': Key.escape })[action]) };
      let result;
      const picker = factory(tui, theme, keys, value => { result = value; });
      picker.focused = true;
      assert.equal(picker.focused, true);
      const render = () => picker.render(100).join('\n');
      assert.match(render(), /3 models/);
      assert.match(render(), /^─+\n\nSearch:/);
      assert.match(render(), /\n─+$/);
      assert.doesNotMatch(render(), /Model information/);
      assert.match(render(), /\nSort: Name\n\n/);
      assert.match(render(), /\[opencode-go\]/);
      assert.match(render(), /─/);
      assert.match(render(), /Snapshot: \d{4}-\d{2}-\d{2}/);
      assert.doesNotMatch(render(), /Snapshot: \d{4}-\d{2}-\d{2}T/);
      picker.handleInput('\t');
      assert.match(render(), /Scope: all/);
      assert.match(render(), /3 models/);
      picker.handleInput('deepseek');
      assert.match(render(), /1 models/);
      assert.match(render(), /EQ-Bench/);
      assert.match(render(), /─+\nContext:/);
      assert.doesNotMatch(render(), /opencode-go\/deepseek-v4-pro/);
      picker.handleInput('\x13'); assert.match(render(), /Sort by/);
      picker.handleInput('\x1b[B'); picker.handleInput('\r'); assert.match(render(), /Sort: Coding/);
      for (const height of [8, 12, 24, 40]) for (const width of [10, 20, 40, 100]) {
        tui.terminal.rows = height;
        const lines = picker.render(width);
        assert.ok(lines.length <= height);
        assert.ok(lines.every(line => visibleWidth(line) <= width));
        if (width === 100) assert.match(lines.join('\n'), /Enter switch.*Esc cancel/);
      }
      tui.terminal.rows = 24;
      picker.invalidate(); picker.handleInput('\r');
      assert.equal(result.id, 'deepseek-v4-pro');
      return result;
    } },
  };
  await command.handler('', ctx);
  assert.equal(switched.id, 'deepseek-v4-pro');
  assert.equal(notices.at(-1)[1], 'info');
  ctx.scopedModels = [{ model: models[2] }];
  ctx.ui.custom = async factory => {
    const picker = factory({ terminal: { rows: 24 }, requestRender() {} }, { fg: (_, s) => s }, {}, () => {});
    const view = picker.render(100).join('\n');
    assert.match(view, /1 models/); assert.match(view, /unknown/); assert.doesNotMatch(view, /deepseek/);
    assert.match(view, /Scope: scoped/);
    picker.handleInput('\t');
    assert.match(picker.render(160).join('\n'), /Scope: all.*3 models/);
    picker.handleInput('deepseek');
    assert.match(picker.render(160).join('\n'), /1 models/);
    picker.handleInput('\t');
    assert.match(picker.render(160).join('\n'), /Scope: scoped.*0 models/);
    picker.handleInput('\t');
    assert.match(picker.render(160).join('\n'), /Scope: all.*1 models/);
    let cancelled;
    const cancelPicker = factory({ terminal: { rows: 24 }, requestRender() {} }, { fg: (_, s) => s }, {}, v => { cancelled = v; });
    cancelPicker.handleInput('\x1b'); assert.equal(cancelled, null);
    return null;
  };
  switched = undefined;
  await command.handler('', ctx); assert.equal(switched, undefined);
  ctx.ui.custom = async () => models[2];
  extension({ registerCommand(_name, value) { command = value; }, async setModel() { return false; } });
  await command.handler('', ctx);
  assert.equal(notices.at(-1)[1], 'error');
  ctx.modelRegistry.getAvailable = () => [];
  ctx.ui.custom = async () => assert.fail('No picker should open without available models');
  await command.handler('', ctx);
  assert.match(notices.at(-1)[0], /No available models/);
  factoryCalled = false; ctx.mode = 'rpc'; await command.handler('', ctx); assert.equal(factoryCalled, false);
});
