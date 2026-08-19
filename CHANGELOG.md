# Changelog

All notable changes to EA Media Tools are documented here.

## [0.3.2] - 2026-08-19

### Changed

- Use the canonical `eaforlife/media-converter` repository slug throughout updater, publisher, package, and documentation metadata.
- Limit automatic Squirrel updates to Windows x64; Windows ARM64, unsigned macOS, and Linux builds now receive platform-specific manual update guidance.

### Fixed

- Correct the public Electron update feed that returned 404 during automatic and manual update checks.
- Replace verbose Squirrel/.NET failures with a concise message and direct release-page guidance.

## [0.3.1] - 2026-08-19

### Added

- Added automated coverage for automatic, explicit, disabled, and Cellular scaling profiles.

### Changed

- Moved the development and release-build toolchain to Node.js 24.
- Updated GitHub Actions to supported releases that run on the Node.js 24 Actions runtime.
- Kept clean npm 12 installs compatible with Electron Forge's pinned Git-based `node-gyp` dependency.
- Unified CUDA, QSV, AMF, VA-API, and software scaling around the strict 4K (`2720:-2`), 1080p (`1760:-2`), 720p (`1320:-2`), and 360p/Cellular (`720:-2`) output profiles.
- Prepend curated release highlights to GitHub's automatically generated full changelog.

### Fixed

- Apply bitrate, buffer, quality, audio, and NVENC multipass settings from the selected output tier instead of the source resolution.
- Make Streaming at 360p use the same quality and audio profile as Cellular.
- Preserve an explicitly selected built-in scale profile across every item in a batch and newly added source files.
- Update buffer size immediately when maximum bitrate changes and preserve the preset buffer multiplier in custom settings.

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

[0.3.2]: https://github.com/eaforlife/media-converter/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/eaforlife/media-converter/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/eaforlife/media-converter/releases/tag/v0.3.0
