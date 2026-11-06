# pi-model-info

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A [Pi](https://github.com/earendil-works/pi) extension that compares available models with bundled benchmark information. Search models, compare coding, writing, and intelligence scores, then select a model for the current session.

## Installation

### Global installation

```sh
pi install git:github.com/datfinesoul/pi-model-info
```

Pi records this package in `~/.pi/agent/settings.json`.

### Project installation

```sh
pi install --local git:github.com/datfinesoul/pi-model-info
```

Pi records this package in `.pi/settings.json`. Project packages load only after project trust. Run `/reload` or start a new session after installation.

> [!NOTE]
> Pi identifies a package by where it was installed from. Installing pi-model-info globally and for a project from the same source is fine: the project installation replaces the global one. Installing it from different locations, such as GitHub globally and a local checkout for a project, loads both copies, and Pi does not reconcile them.

<details>
<summary>Install from a local checkout</summary>

```sh
pi install /path/to/pi-model-info
pi install --local /path/to/pi-model-info
```

To try the checkout without changing settings:

```sh
pi --no-extensions --extension ./extensions/model-info/index.ts
```

</details>

## Usage

Run `/models` in interactive TUI mode.

- Type to search by provider or model name.
- Use Up/Down to select a row.
- Press Tab to toggle between scoped and all available models when a scope exists.
- Press Ctrl+S to open the sort menu.
- Press Ctrl+E to inspect benchmark evidence for the selected model. Use Up/Down to scroll and Escape to return.
- Use Up/Down and Enter to choose a sort.
- Press Enter on a model to switch the current session.
- Press Escape to cancel without switching.

The picker supports Pi's configured selection keybindings. Ctrl+S is a fixed picker key, not a global shortcut. The built-in `/model` command remains unchanged.

| Sort | Value | Source |
|------|-------|--------|
| Name | Provider/model ID | Live Pi registry |
| Coding index | AA coding index, normalized to 0–1 | OpenRouter-mirrored AA index |
| DeepSWE max effort | DeepSWE 1.1, 0–1 fraction | Vendor maximum published effort |
| Writing | Bradley-Terry score, 0–100, not a percentage | AI Writing Benchmark (AI-judged) |

Numeric sorts descend and place unavailable values last. Equal scores tie. Numeric order does not establish statistical significance. Scores use different scales and are not a composite rating.

The Coding index sort uses the bundled canonical `coding.value` AA index. It provides broader coverage without mixing benchmarks. Its normalization does not make it comparable to DeepSWE. Source variants and effort can differ. The evidence view identifies the index source and comparison group.

DeepSWE max effort uses the producer-selected `consumerComparisons.coding` result. DeepSWE 1.1 covers 3 of 44 canonical models: Claude Opus 5.5 (0.742), GPT-6.1 Sol (0.719), and GPT-6 Luna (0.6659). This is a conditional benchmark-specific comparison, not overall coding ability. Vendor protocols are not verified equivalent. Maximum published effort does not imply equal compute. Comparable uncertainty intervals are unavailable. Sol's higher high-effort result does not replace its selected max-effort score. The publisher's 15-model series and AA index remain separate evidence, never fallbacks. Rows round Coding to four decimal places. Sorting and evidence retain exact values.

Writing uses the producer-selected `consumerComparisons.writing` result from the AI Writing Benchmark, covering 38 of 44 canonical models. These scores reflect AI-judge preferences, not human ratings. The value 50 estimates an even chance against the average model in English. It is not a percentage. Missing scores remain unknown, even when EQ-Bench Elo exists in the bundle.

Each row shows AA, DeepSWE, and Writing scores, regardless of the active sort. Missing values show `n/a`. The bottom panel shows only context limits, output limits, reasoning support, and image input.

The sort menu always contains Name, Coding index, DeepSWE max effort, and Writing. Scope changes preserve the selected sort. Individual benchmark groups and intelligence are not main-menu choices.

Effort, quantization, and evaluation conditions can differ between models. Use Ctrl+E for source details, variants, and missing-score explanations.

## How it works

The extension reads `extensions/model-info/summary.json` when the picker opens. Its `consumer-comparisons-1` contract supplies both domain comparisons and their selection policies. The bundled `measurement-contract.json` retains detailed evidence but is not required at runtime. Both artifacts are unchanged copies from `datfinesoul/model-info/data/`. Tests check agreement between their complete `consumerComparisons` objects. The evidence artifact's `series` array does not define the sort menu. `snapshot.json` records the source revision, path, SHA-256 hash, and generator hashes. It explicitly marks snapshots generated from uncommitted source changes. The summary records input hashes, so a Git revision alone is not the provenance claim. The bundled generation timestamp appears in the picker.

Pi's live registry determines availability, context limits, reasoning support, and image input. The picker starts with session-scoped models when a scope exists. Tab switches between scoped and all available models without changing the search. It preserves the selected sort even when the new scope has no scores for it. Without a scope, it shows all available models and Tab has no effect. The schema `1.0.0` summary maps each exact provider/model route to a canonical model. Verified routes share that model's benchmark record, including Luna through OpenCode and Copilot. No runtime alias guessing occurs. Models without benchmark data remain selectable. The bundle covers 52 routes and 44 canonical models. One route has an unresolved identity.

The evidence view shows individual ZeroEval coding results, reporting and verification flags, evaluation conditions, comparison groups, and source links. These results never become a composite coding sort. It also shows the producer-selected measurement labels, policies, conditions, limitations, coverage, efforts, uncertainty, source IDs, and provenance. Missing values include the producer's reason. Writing details include score intervals, comparison counts, and separate human measurements. Source matches and snapshot metadata remain available for inspection. EQ-Bench Elo and other secondary measures remain in the bundled artifact but are not picker sort keys.

The consumer validates the contract revision, complete canonical results, comparison groups, scales, coverage, and numeric order. It rejects older snapshots without `consumerComparisons`, even if they declare schema `1.0.0`. General and Vision remain deferred. ZeroEval category means remain evidence only. The AA coding index has its own sort. It never replaces a missing DeepSWE comparison result.

Missing or invalid benchmark data produces a warning. Model selection remains available without enrichment. The extension does not download data, regenerate scores, call an LLM, track cache usage, or write configuration. Selection changes only the current session model, not the default for new sessions. Authentication failure produces an error notification.

The module has no configuration files or background tasks. Snapshot updates ship with a new extension version. The source datasets retain their upstream attribution in the bundled summary. The extension license does not grant additional rights to third-party datasets.

## Development

The extension has no runtime dependencies beyond the Pi host and no build step. Pi imports the picker and catalog through TypeScript modules so `/reload` refreshes both. Plain Node tests use a JavaScript entry point that re-exports the catalog. Node.js 22.19 or newer supports this without compilation.

This module keeps pure catalog logic in `src/catalog.ts` rather than the shared standard's JavaScript implementation layout. The JavaScript test entry point preserves plain Node testing. This local exception avoids native ESM caching during Pi reloads and does not change the shared standard.

```sh
npm test
npm run pack:check
# Or use pnpm for both commands.
```

To run the installed-Pi component checks:

```sh
PI_CODING_AGENT_ENTRY=/path/to/pi-coding-agent/dist/index.js npm test
```

Without this variable, installed-Pi checks report a skip. The reload regression test uses Pi's actual loader in one process and verifies edits to both the picker and catalog. Manual checks must cover terminal appearance, focus, regular and fullscreen modes, and authenticated switching.

### Update the bundled snapshot

1. Copy `data/summary.json` and `data/measurement-contract.json` into `extensions/model-info/` without changing their bytes.
2. Update `snapshot.json` with the source revision, SHA-256 hashes, schema versions, and generator hashes for both artifacts.
3. Record the snapshot update in the branch's changelog section. Set a new version once for a new feature branch, not for each snapshot edit.
4. Run the tests and package checks.

No source checkout is required at runtime. Do not run the source acquisition pipeline during extension startup or package installation.

Each feature branch that triggers CI gets one version update relative to its base. Keep that version unchanged throughout the branch. Record subsequent user-visible changes under the same matching `## [<version>] - <date>` changelog heading. Do not increment the patch version for each edit, fix, or conversation turn. CI requires the branch version to exceed its base version. Pull requests that change only Markdown skipped by CI are exempt. After merge and successful CI, the Release workflow tags the tested commit `v<version>`. Merges that do not change the version are not tagged.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution instructions.

## License

[MIT](LICENSE) © Philip Hadviger.
