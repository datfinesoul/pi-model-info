import type { ExtensionAPI } from '@earendil-works/pi-coding-agent';
import { Input, SelectList, truncateToWidth, matchesKey, Key } from '@earendil-works/pi-tui';
import { readFile } from 'node:fs/promises';
import { joinModels, parseSummary } from '../../src/catalog.ts';
import { createPicker } from '../../src/picker.ts';

export default function (pi: ExtensionAPI) {
  pi.registerCommand('models', {
    description: 'Compare available models using bundled benchmark information',
    handler: async (_args, ctx) => {
      if (ctx.mode !== 'tui') {
        if (ctx.hasUI) ctx.ui.notify('/models requires interactive TUI mode', 'warning');
        return;
      }
      let catalog;
      try {
        catalog = parseSummary(await readFile(new URL('./summary.json', import.meta.url), 'utf8'));
      } catch (error) {
        ctx.ui.notify(`Bundled model information unavailable: ${error instanceof Error ? error.message : String(error)}`, 'warning');
      }
      const available = await ctx.modelRegistry.getAvailable();
      const scoped = ctx.scopedModels;
      const scopeKeys = new Set(scoped.map(({ model }) => `${model.provider}/${model.id}`));
      const models = available;
      if (!models.length) { ctx.ui.notify('No available models in the current scope', 'warning'); return; }
      const selected = await ctx.ui.custom<(typeof models)[number] | null>((tui, theme, keybindings, done) =>
        createPicker(joinModels(models, catalog), catalog?.generatedAt,
          { Input, SelectList, truncateToWidth, matchesKey, Key }, tui, theme, keybindings, done, scopeKeys));
      if (selected) {
        const success = await pi.setModel(selected);
        ctx.ui.notify(success ? `Switched to ${selected.provider}/${selected.id}` : `Authentication unavailable for ${selected.provider}`,
          success ? 'info' : 'error');
      }
    },
  });
}
