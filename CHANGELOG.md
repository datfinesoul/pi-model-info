# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-03

### Added

- Add an interactive `/models` picker with search, score sorting, compact details, and manual model selection.
- Use Tab to toggle between scoped and all available models while preserving search and sort.
- Separate search, controls, model rows, and details with spacing and dividers. Frame the picker with horizontal lines. Show provider badges and a shorter snapshot date.
- Bundle the existing model-info summary with source revision and hash metadata.
- Preserve exact provider/model matches, unknown scores, and Pi session scoping.
- Consume summary schema `1.0.0` with shared canonical benchmarks and separate provider routes. Bundle 52 routes across OpenCode and Copilot, including shared Luna scores.

### Changed

- Refresh the bundled artifact from the model-info working tree and record its revision, source hash, and generator hashes.
- Migrate Coding and Writing to producer-selected `consumerComparisons` in the summary's `consumer-comparisons-1` contract.
- Use vendor maximum published effort for DeepSWE 1.1 Coding: Opus 0.742, Sol 0.719, and Luna 0.6659. Keep publisher and AA evidence separate.
- Show producer policies, conditions, coverage, missing-value reasons, uncertainty, and provenance. Preserve exact numeric sorting, ties, and unavailable rows.
- Keep the schema `2.0.0` measurement artifact as bundled evidence, not a required runtime input or sort menu.
- Validate source-specific comparison groups and scales instead of relying on schema `1.0.0` alone.
- Use one Writing sort with AI Writing Benchmark scores, labeled as AI-judged on a 0–100 scale, not a percentage. Show its source variant, effort, and quantization.
- Remove EQ-Bench Elo from the sort menu and details. Preserve its original values in the bundled artifact without conversion or blending.
- Keep missing scores unavailable instead of using alternate sources.
- Add a scrollable Ctrl+E evidence view for coding results, reporting flags, conditions, and writing uncertainty.
- Test every bundled route against its canonical metrics and complete ZeroEval coding evidence.

- Show available scores in every model row instead of repeated missing-value dashes. Limit the bottom panel to live model properties.
- Keep a stable Name, Coding index, DeepSWE max effort, and Writing sort menu in every scope. Remove intelligence from the main menu.
- Add the broader OpenRouter-mirrored AA Coding index as a separate sort and row value. Never blend it with DeepSWE or use it as a fallback.

### Fixed

- Load picker and catalog code through TypeScript so `/reload` refreshes both without restarting Pi.
- Remove the repeated model name from the detail panel.
