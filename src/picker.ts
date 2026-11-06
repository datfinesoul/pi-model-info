import { detailLines, evidenceLines, filterSort, rowDescription, sortOptions, CODING_NOTE } from './catalog.ts';

// Host components are injected so the picker can be tested without installing Pi.
export function createPicker(items, generatedAt, { Input, SelectList, truncateToWidth, visibleWidth, wrapTextWithAnsi, matchesKey, Key }, tui, theme, keybindings, done, scopeKeys = new Set()) {
  let scoped = scopeKeys.size > 0;
  const input = new Input({ prompt: 'Search: ', placeholder: 'provider or model' });
  let mode = 'name';
  let sorting = false;
  let evidence = false;
  let evidenceOffset = 0;
  let evidenceMax = 0;
  let sortIndex = 0;
  let sorts = [];
  let current = [];
  let list;
  let listHeight = 6;
  const listTheme = {
    selectedPrefix: t => theme.fg('accent', t), selectedText: t => theme.fg('accent', t),
    description: t => theme.fg('muted', t), scrollInfo: t => theme.fg('dim', t), noMatch: t => theme.fg('warning', t),
  };
  const rebuild = (visible = listHeight) => {
    listHeight = visible;
    const selected = list?.getSelectedItem()?.value;
    const scopedItems = scoped ? items.filter(item => scopeKeys.has(item.key)) : items;
    sorts = sortOptions(scopedItems);
    if (!sorts.some(sort => sort.id === mode)) mode = 'name';
    current = filterSort(scopedItems, input.getValue(), mode);
    list = new SelectList(current.map(item => ({ value: item.key, label: item.model.id,
      description: rowDescription(item, mode),
    })), visible, listTheme);
    list.onSelect = item => done(items.find(entry => entry.key === item.value)?.model ?? null);
    list.onCancel = () => done(null);
    list.onSelectionChange = () => tui.requestRender();
    const index = current.findIndex(item => item.key === selected);
    list.setSelectedIndex(Math.max(0, index));
  };
  rebuild();
  const action = (data, name, fallback) => keybindings.matches?.(data, name) ?? matchesKey(data, fallback);
  return {
    get focused() { return input.focused; },
    set focused(value) { input.focused = value; },
    capturesViewportInput: true,
    render(width) {
      const height = Math.max(1, tui.terminal.rows - 2);
      let lines;
      const dim = text => theme.fg('dim', text);
      const accent = text => theme.fg('accent', text);
      const divider = dim('─'.repeat(Math.max(0, Math.min(width, 72))));
      if (evidence) {
        const item = items.find(item => item.key === list.getSelectedItem()?.value);
        const rows = evidenceLines(item).flatMap(line => wrapTextWithAnsi(line, Math.max(1, width)));
        const pageSize = Math.max(1, height - 4);
        evidenceMax = Math.max(0, rows.length - pageSize);
        evidenceOffset = Math.min(evidenceOffset, evidenceMax);
        lines = [accent('Benchmark evidence'), divider,
          ...rows.slice(evidenceOffset, evidenceOffset + pageSize),
          dim(`↑↓ scroll   Esc back   ${evidenceOffset + 1}/${rows.length}`), divider];
      } else if (sorting) {
        const count = Math.max(1, height - 7);
        const start = Math.max(0, Math.min(sortIndex - Math.floor(count / 2), sorts.length - count));
        lines = [divider, accent(`Sort by (${sortIndex + 1}/${sorts.length})`), '', ...sorts.slice(start, start + count).map((sort, i) =>
          i + start === sortIndex ? accent(`  → ${sort.label}`) : `    ${sort.label}`),
          '', dim('↑↓ navigate   Enter select   Esc back'), divider];
      } else {
        const selectedItem = () => items.find(item => item.key === list.getSelectedItem()?.value);
        const details = detailLines(selectedItem());
        const visible = Math.max(1, Math.min(8, height - details.length - 12));
        if (visible !== listHeight) rebuild(visible);
        const help = `Esc cancel${scopeKeys.size ? '   Tab scope' : ''}   Ctrl+S sort   Ctrl+E evidence`;
        const footer = [dim(CODING_NOTE), dim(help), dim(`Snapshot: ${generatedAt ? generatedAt.slice(0, 10) : 'unavailable'}`), divider];
        const sort = `${dim('Sort: ')}${sorts.find(sort => sort.id === mode)?.label ?? 'Name'}`;
        const scope = truncateToWidth(
          `${dim('Scope: ')}${accent(scoped ? 'scoped' : 'all')}   ${dim(`${current.length} models`)}`,
          Math.max(0, width - visibleWidth(sort) - 2));
        const header = [divider, '', ...input.render(width),
          `${scope}${' '.repeat(Math.max(2, width - visibleWidth(scope) - visibleWidth(sort)))}${sort}`, ''];
        const detailRows = detailLines(selectedItem()).map(line =>
          theme.fg(/^(No bundled)/.test(line) ? 'dim' : 'muted', line));
        // On short terminals reserve the footer rather than clipping the controls.
        const body = [...header, ...list.render(width), '', divider, ...detailRows, ''];
        lines = [...body.slice(0, Math.max(0, height - footer.length)), ...footer];
      }
      return lines.slice(0, height).map(line => truncateToWidth(line, width));
    },
    invalidate() { input.invalidate(); list.invalidate(); },
    handleInput(data) {
      if (evidence) {
        if (action(data, 'tui.select.cancel', Key.escape) || matchesKey(data, Key.ctrl('e'))) evidence = false;
        else if (action(data, 'tui.select.up', Key.up)) evidenceOffset = Math.max(0, evidenceOffset - 1);
        else if (action(data, 'tui.select.down', Key.down)) evidenceOffset = Math.min(evidenceMax, evidenceOffset + 1);
      } else if (sorting) {
        if (action(data, 'tui.select.cancel', Key.escape)) sorting = false;
        else if (action(data, 'tui.select.up', Key.up)) sortIndex = (sortIndex + sorts.length - 1) % sorts.length;
        else if (action(data, 'tui.select.down', Key.down)) sortIndex = (sortIndex + 1) % sorts.length;
        else if (action(data, 'tui.select.confirm', Key.enter)) { mode = sorts[sortIndex].id; sorting = false; rebuild(); }
      } else if (action(data, 'tui.input.tab', Key.tab)) {
        if (scopeKeys.size) { scoped = !scoped; rebuild(); }
      } else if (matchesKey(data, Key.ctrl('e'))) {
        evidence = true; evidenceOffset = 0;
      } else if (matchesKey(data, Key.ctrl('s'))) {
        sorting = true; sortIndex = sorts.findIndex(sort => sort.id === mode);
      } else if (['tui.select.up', 'tui.select.down', 'tui.select.confirm', 'tui.select.cancel'].some((name, i) =>
        action(data, name, [Key.up, Key.down, Key.enter, Key.escape][i]))) {
        list.handleInput(data);
      } else {
        input.handleInput(data); rebuild();
      }
      tui.requestRender();
    },
  };
}
