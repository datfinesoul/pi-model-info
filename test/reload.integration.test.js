import assert from 'node:assert/strict';
import { test } from 'node:test';
import { mkdtemp, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const entry = process.env.PI_CODING_AGENT_ENTRY;

test('actual Pi loader reloads both picker and catalog in the same process', {
  skip: !entry && 'Set PI_CODING_AGENT_ENTRY to installed Pi dist/index.js',
}, async () => {
  const { loadExtensions, clearExtensionCache } = await import(new URL('./core/extensions/loader.js', pathToFileURL(entry)).href);
  const directory = await mkdtemp(join(tmpdir(), 'pi-model-info-reload-'));
  try {
    const root = new URL('../', import.meta.url);
    for (const name of ['package.json', 'extensions', 'src']) {
      await cp(new URL(name, root), join(directory, name), { recursive: true });
    }
    const pickerPath = join(directory, 'src/picker.ts');
    const catalogPath = join(directory, 'src/catalog.ts');
    const pickerText = await readFile(pickerPath, 'utf8');
    const catalogText = await readFile(catalogPath, 'utf8');
    const model = { provider: 'opencode-go', id: 'deepseek-v4-pro', input: ['text'], contextWindow: 100000, maxTokens: 1000 };
    const other = { ...model, id: 'unknown' };
    const render = async () => {
      clearExtensionCache();
      const loaded = await loadExtensions([join(directory, 'extensions/model-info/index.ts')], directory);
      assert.deepEqual(loaded.errors, []);
      let view;
      await loaded.extensions[0].commands.get('models').handler('', {
        mode: 'tui', scopedModels: [{ model }], modelRegistry: { getAvailable: () => [model, other] },
        ui: {
          notify(message) { assert.fail(message); },
          async custom(factory) {
            const component = factory({ terminal: { rows: 40 }, requestRender() {} }, { fg: (_, text) => text }, {}, () => {});
            view = component.render(160).join('\n');
            assert.match(view, /Scope: scoped.*1 models/);
            component.handleInput('\t');
            assert.match(component.render(160).join('\n'), /Scope: all.*2 models/);
            return null;
          },
        },
      });
      return view;
    };
    assert.match(await render(), /Search:/);
    assert.notEqual(pickerText.replace("prompt: 'Search: '", "prompt: 'Reloaded picker: '"), pickerText);
    await writeFile(pickerPath, pickerText.replace("prompt: 'Search: '", "prompt: 'Reloaded picker: '"));
    assert.match(await render(), /Reloaded picker/);
    assert.notEqual(catalogText.replace("name: 'Name'", "name: 'Reloaded catalog'"), catalogText);
    await writeFile(catalogPath, catalogText.replace("name: 'Name'", "name: 'Reloaded catalog'"));
    const final = await render();
    assert.match(final, /Reloaded picker/);
    assert.match(final, /Sort: Reloaded catalog/);
    assert.match(final, /Writing 58/);
    assert.doesNotMatch(final, /EQ-Bench|Elo/);
  } finally {
    clearExtensionCache();
    await rm(directory, { recursive: true, force: true });
  }
});
