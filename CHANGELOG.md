# Changelog

All notable changes to EA Media Tools are documented here.

## [Unreleased]

### Changed

- Moved the development and release-build toolchain to Node.js 24.
- Updated GitHub Actions to supported releases that run on the Node.js 24 Actions runtime.
- Kept clean npm 12 installs compatible with Electron Forge's pinned Git-based `node-gyp` dependency.

## [0.3.0] - 2026-08-19

### Added

- Encode up to two files simultaneously when the entire batch uses NVIDIA NVENC.
- Wait 10 seconds before an encode slot starts its next queued file.
- Report whether a manual update check found an update, found the app current, failed, or timed out.

### Changed

- Inspect up to two selected videos concurrently so batch folders become ready sooner while keeping analysis load bounded.
- Publish v0.3.0 and later tagged builds as stable GitHub releases.

### Fixed

- Send eligible auto-crops through the CUVID decoder `-crop` option instead of a video filter.
- Treat crop detections whose X and Y offsets are both zero as full-frame output.
- Convert crop offsets to CUVID edge values with division by two and floor rounding.
- Cancel all active parallel encodes and interrupt pending cooldowns when the queue is stopped or a job fails.

[0.3.0]: https://github.com/eaforlife/EA-Media-Tools/releases/tag/v0.3.0
