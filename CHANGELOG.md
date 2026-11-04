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

### Fixed

- Load picker and catalog code through TypeScript so `/reload` refreshes both without restarting Pi.
- Remove the repeated model name from the detail panel.
