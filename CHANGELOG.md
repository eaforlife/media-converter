# Changelog

All notable changes to EA Media Tools are documented here.

## [Unreleased]

## [1.1.0] - 2026-08-25

### Added

- Install and maintain separate stable and prerelease Jellyfin FFmpeg runtimes under `lib/ffmpeg-stable` and `lib/ffmpeg-unstable`.
- Add a welcome-page-only **Stable** runtime switch that persists between launches, reruns hardware detection when changed, and reports the selected release in the status bar.
- Download and verify rsgain 3.7 under `lib/rsgain` for future ReplayGain processing.
- Download compatible official CCExtractor builds under `lib/ccextractor` and add opt-in CEA-608/708 extraction to SRT before remuxing the caption track with FFmpeg.
- Add regression coverage for closed-caption command composition and the 1080p quality profile.

### Changed

- Complete the application update check on the splash screen before settings, managed runtimes, or hardware capabilities are initialized.
- Check for application updates every 15 minutes after startup and cleanly cancel encodes before restarting into an update.
- Use CQ 28 for Streaming jobs whose source or explicitly scaled output resolves to the 1080p profile.
- Show a green stable or yellow prerelease FFmpeg status indicator with the installed Jellyfin release number.

### Fixed

- Keep **Done** hidden for every pending, starting, or active encode and reveal it only after every queue item has completed or cancelled.
- Remove temporary CCExtractor SRT files on success, failure, cancellation, and application shutdown.

## [1.0.0] - 2026-08-19

### Added

- Add independent Video, Audio, and Subtitles processing switches. Enabled sections use their configured encoders, while disabled sections copy every matching source stream.
- Add metadata-only stream-copy updates when all three processing sections are disabled, including editable language, default, forced, and hearing-impaired values for video, audio, and subtitle streams.
- Add per-source metadata editing for batch queues, queue-indexed `_tmp00` staging files, and guarded same-directory source replacement with automatic restoration if finalization fails.
- Add an installed-version **View Change Log** viewer to the gear menu, backed by the matching GitHub release notes.
- Add the **ea-video** codename to the 1.0 identity.

### Changed

- Disable smart naming and processing controls during metadata-only updates, retain the original directory and filename, and show an explicit replacement confirmation before starting.
- Follow the Live FFmpeg Output tail only while the viewer is already at the bottom, allowing earlier session commands to remain readable while active jobs append output.
- Show elapsed time in the progress title and expose **Done** only after a successful queue completion or an explicitly cancelled queue has fully settled.
- Keep startup on the loading screen while the Windows updater resolves, with live status through checking, download, restart confirmation, timeout, or failure.

### Fixed

- Make manual update checks join the automatic update process already in progress instead of launching a second Squirrel command.
- Preserve copied stream language and disposition metadata when only selected media sections are processed.

### Safety

- Metadata-only updates never delete the source before FFmpeg produces a complete staged file.
- If installing the staged file fails, restore the original from a temporary backup; retain and log that backup if cleanup cannot safely remove it.

## [0.4.0] - 2026-08-19

### Added

- Add a paginated progress page for every queued encode, with job-specific pending, active, completed, failed, cancelled, and skipped states.
- Add individual active-job cancellation alongside queue-wide cancellation for parallel NVENC sessions.
- Add a session-wide **Live FFmpeg Output** console that appends commands as jobs start and redacts executable, input, and output paths.
- Add terminal **Start New** and **Done** actions. **Start New** clears the working encode session; **Done** waits for queue and partial-output cleanup before closing the app.
- Add regression coverage for queue progress state and FFmpeg command redaction.

### Changed

- Keep the progress window open after both single-file and batch queues settle, without a dismiss control during active encoding.
- Upgrade Electron, ESLint, TypeScript lint integration, update-electron-app, and the latest stable Electron Forge-compatible Vite toolchain.
- Move Vite configuration to explicit ESM configuration files and remove deprecated build-option warnings.
- Use the operating system's bsdtar implementation for verified FFmpeg ZIP archives instead of the vulnerable `extract-zip` package.

### Fixed

- Apply strict output-tier scaling, bitrate, buffer, quality, audio, and NVENC settings when a built-in output resolution is selected.
- Keep buffer size synchronized with maximum bitrate using the active preset multiplier.
- Correct the Windows x64 updater feed and replace verbose Squirrel failures with actionable feedback.
- Preserve completed job details and output actions while other files remain active or pending.

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

[1.1.0]: https://github.com/eaforlife/media-converter/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/eaforlife/media-converter/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/eaforlife/media-converter/compare/v0.3.0...v0.4.0
[0.3.2]: https://github.com/eaforlife/media-converter/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/eaforlife/media-converter/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/eaforlife/media-converter/releases/tag/v0.3.0
