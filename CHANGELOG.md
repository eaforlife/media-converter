# Changelog

All notable changes to EA Media Tools are documented here.

## [Unreleased]

### Changed

- Set the Streaming bitrate buffer multiplier to 1x.
- Disable spatial AQ and enable temporal AQ for Streaming sources at 720p and below, including the inherited 360p Cellular delivery stack, while preserving direct Cellular HEVC defaults.

## [2.6.8] - 2026-09-03

### Fixed

- Replace Video, Filters, and audio custom switches with button-backed ARIA switches so changing options such as Temporal AQ never enters the native checkbox paint path that could blank the Windows window.
- Remove the ineffective full-window repaint IPC that could retrigger the same Chromium rendering failure after checkbox changes.

## [2.6.7] - 2026-09-03

### Fixed

- Force a complete Windows window repaint after checkbox and radio state changes, preventing a responsive frameless renderer from remaining visually blank.
- Keep custom toggle inputs visually hidden without a transparent native-control layer that can invalidate the software-rendered window surface.

## [2.6.6] - 2026-09-02

### Fixed

- Remove toggle track and thumb animations that could invalidate the complete frameless Windows surface, preventing the UI from turning blank when any video or filter switch changes.
- Hand locked obsolete Windows installation directories to a hidden post-exit cleanup helper, including during Squirrel's updated event, so residual `app.asar` files are deleted after handles close instead of accumulating on every update.
- Log each failed immediate cleanup target and Windows error independently while keeping the splash cleanup attempt bounded to one pass.

## [2.6.5] - 2026-09-02

### Changed

- Build and publish Windows releases for x64 only, removing the Windows ARM64 workflow job to shorten release builds.

### Fixed

- Disable Chromium GPU compositing and the Windows DirectComposition surface path in addition to Electron UI hardware acceleration, preventing the frameless interface from blanking after encoder and advanced-video toggle changes while leaving FFmpeg GPU acceleration available.

## [2.6.4] - 2026-09-02

### Fixed

- Never remove application directories while Squirrel owns an update transaction, preventing cleanup from racing the updater or deleting a newly staged version.
- Delete only `app-<version>` directories older than the running application, preserving the current directory and every newer staged directory.
- Run first-start cleanup after the splash renderer is visible, process old directories sequentially, and use short bounded lock retries so cleanup cannot hide the UI or create prolonged parallel disk activity.

## [2.6.3] - 2026-09-02

### Added

- Add a Video-tab frame-rate override switch driven by the active preset's `frame_rate`: sources below the target are off and locked, matching sources are off and editable, faster sources are on and editable, and off always means passthrough.
- Add validated per-output-tier `multipass_<tier>` preset overrides.
- Add an independent HEVC Main10 toggle for every HEVC encoder that passes its 10-bit capability test, while preserving automatic source-based defaults.

### Changed

- Set Streaming multipass to disabled for 4K output and quarter-resolution for 1080p, 720p, and 360p output; Cellular uses quarter-resolution multipass at 360p.
- Preserve frame-rate targets in saved custom presets while defaulting older custom preset files to passthrough.
- Convert SDR frames to CUDA-native `p010le` surfaces inside `scale_cuda` when HEVC Main10 is enabled, retaining the zero-copy NVDEC-to-NVENC path.

### Fixed

- Recursively remove every obsolete Windows `app-<version>` directory at startup and during update installation, with retries for partially locked `app.asar` remnants while preserving only the running version.
- Keep splash initialization paused after an update is detected until its download completes and the Restart/Later prompt is answered; deferred updates install when the app exits.

## [2.6.2] - 2026-09-02

### Added

- Add visible discovery, indexing, and inspection progress for folder and multi-file scans.
- Add a default-on simultaneous-encoding setting for multi-source queues, with up to four concurrent audio encodes and the existing adaptive NVENC scheduling.
- Add validated `frame_rate` values to `presets.ini`: `23.976` for Streaming and Cellular and `passthrough` for every other built-in preset.

### Changed

- Replace synchronous recursive folder scanning with bounded asynchronous indexing and inspect large audio-only libraries with up to 12 concurrent probes.
- Show rolling interval bitrate in the encode window so quality-based VBR relaxation is visible while retaining Streaming's `video_bitrate=0` behavior.
- Convert Streaming and Cellular sources above 24 fps to exact `24000/1001` CFR without retiming their audio.

### Fixed

- Rename the console to Live Process Output and show rsgain commands when normalization is the only work in the queue.
- Yield to the renderer before scanning so the picker animation is visible during large-library analysis.

## [2.6.1] - 2026-09-02

### Changed

- Set Streaming NVENC quality to CQ 31 for 4K and 1080p sources and CQ 32 for 720p and below.
- Normalize surround-downmix coefficients instead of applying an additional 1.8x gain before compression.

### Fixed

- Stabilize encoded-audio timestamps with asynchronous resampling to prevent gaps and overlaps from producing audible choppiness.
- Add a latency-compensated lookahead limiter after dynamic range compression to prevent clipped peaks and static-like distortion.

## [2.6.0] - 2026-09-01

### Added

- Add a Filters-tab H.264 High-profile toggle that defaults on whenever an H.264 encoder is selected.
- Add validated per-output-tier codec defaults and codec-specific advanced-video overrides to `presets.ini`.

### Changed

- Use HEVC Main for normal 4K/1080p Streaming output and HEVC Main10 by default for HEVC Main10, HDR, and Dolby Vision sources when the selected output path supports 10-bit encoding.
- Switch Streaming output to AV1 for automatic or explicitly scaled 720p and 360p tiers.
- Hide unsupported controls for the active encoder and prevent stale preset values from emitting unsupported FFmpeg arguments.
- Disable AV1 B-frame-count defaults and stop emitting `-bf` for AV1 NVENC while retaining its supported multipass, B-reference, lookahead, scene-cut, non-reference-P, and AQ controls.

### Compatibility

- Align AV1 NVENC controls with the encoder options exposed by Jellyfin FFmpeg 7.1 and 8.1.

## [2.5.1] - 2026-08-31

### Changed

- Make H.264 the default video codec for Archive and Regular and select the H.264 High profile from `presets.ini`.
- Add codec-and-tier-specific encoder speed, bitrate, and maximum-rate overrides to the validated built-in preset schema.
- Set the requested H.264 1080p maximum rates to 10000 kbps for Archive, 8000 kbps for Regular, 6500 kbps for Streaming, and 7000 kbps for Music Video; use 4000 kbps at 720p and 360p/Cellular.
- Use P4 for Regular and Streaming H.264 at 4K/1080p, P6 for Music Video, and P2 for those presets at 720p/360p while retaining each preset's existing buffer multiplier.
- Drive Archive bitrate controls from `bitrate_control` in `presets.ini` so its configured maximum rate reaches FFmpeg.

## [2.5.0] - 2026-08-29

### Added

- Add a Filters-tab dynamic range compressor for surround downmixes using Feishin's Default preset: -24 dB threshold, 4:1 ratio, 20 ms attack, 250 ms release, +6 dB makeup gain, and a 2.83 dB knee.
- Add animated file and folder inspection feedback after a source is selected.

### Changed

- Run dynamic range compression immediately after the downmix volume stage for every source with more than two channels, including retained-surround jobs that add a stereo track.
- Enable dynamic range compression by default for Regular, Streaming, Cellular, Music Video, and audio-only Streaming while keeping Archive and Passthrough disabled.
- Persist the new `dynamic_range_compression` boolean in built-in presets, custom presets, and the working settings file.
- Raise Cellular and Music Video spatial AQ strength to 12, set Music Video to P6 at 1080p and 4K, use NVENC CQ 26, and use a 3x bitrate buffer.

### Compatibility

- Verify the full downmix, volume, and `acompressor` chain against Jellyfin FFmpeg 7.1.4 stable and 8.1.2 pre-release.

## [2.4.1] - 2026-08-28

### Added

- Add a validated `[Version: bbe1a13]` commit marker at the top of `presets.ini` and include it in preset synchronization log events.

### Changed

- Give only the Streaming preset a 3x bitrate buffer and spatial AQ strength 12 to further reduce dark-scene blockiness without changing its CQ, encode speed, or maximum rates.
- Set Music Video sources in the 1080p tier to P7 and 7000 kbit/s maximum, and sources in the 4K tier to P6 and 11000 kbit/s maximum, with all four overrides defined in `presets.ini`.
- Improve transcoded MP4 seeking and Jellyfin playback with five-second keyframe spacing, front-loaded metadata, and the browser-compatible `hvc1` tag for HEVC output.
- Move every output tier's resolution, target bitrate, maximum bitrate, and Streaming encoder-family quality value from application code into validated `presets.ini` sections and overrides.
- Format the activity log as one compact event stream, removing the extra blank lines around FFmpeg and FFprobe events and normalizing existing logs.

## [2.4.0] - 2026-08-27

### Added

- Scan UTF-8 SRT, ASS, SSA, and WebVTT sidecars beside every selected video in single-file, multi-file, and recursive folder modes, matching only the video with the same basename in the same directory.
- Import one or more UTF-8 subtitle files directly from the subtitle tab, including during metadata-only source replacement.
- Edit audio and subtitle output languages during conversion, including streams reported as undefined.
- Detect every CUVID decoder exposed by the active Jellyfin FFmpeg and use decoder-side zero-copy crop when the matching NVIDIA format is available.
- Populate normal predefined presets from every valid `presets.ini` section while keeping Music Video exclusive to Music Video mode.

### Changed

- Consolidate default and forced dispositions onto the first flagged audio or subtitle track, inheriting the other primary flag when it was found on another language; hearing-impaired flags remain independent.
- Improve dark-scene quality defaults for Regular, Streaming, Cellular, and Music Video presets while retaining each preset's speed and bitrate limits.
- Create default `converted` directories only after an encode queue has been accepted and is starting.
- Force-close any still-running child process owned by the completed queue without targeting unrelated FFmpeg processes.

### Fixed

- Prevent Windows video-option toggles from blanking the renderer.
- Fall back from unavailable decoder-side NVIDIA crop to the protected NVDEC download, CPU crop, and CUDA upload bridge.
- Convert imported text subtitles to `mov_text` for MP4 output and during MP4 metadata-only source replacement.

## [2.3.1] - 2026-08-27

### Added

- Detect basename-matched SRT sidecars in video folder mode, show them in the subtitle tab, and derive language plus default, forced, and hearing-impaired dispositions from filename tokens.
- Treat folder-mode videos without season and episode numbers as movies, using `converted/Title (Year)/Title.ext` smart output paths.

### Fixed

- Keep generic NVIDIA NVDEC active when auto-crop detects black bars instead of forcing the entire input path to software decoding.
- Bridge CUDA frames through the protected software crop and return them to CUDA for scaling, tone mapping, and NVENC output while retaining the one-time software-decode fallback.
- Report NVIDIA NVDEC in the workspace decoder indicator for auto-cropped NVENC jobs.
- Add external SRT files as explicit FFmpeg inputs and convert them to `mov_text` for MP4 output.

## [2.3.0] - 2026-08-27

### Added

- Add protected 64-frame hardware decode and upload pools for NVIDIA NVDEC, AMD AMF, Intel QSV, Apple VideoToolbox, and VA-API paths where applicable.
- Retry a failed hardware-decoded encode once with software decoding and the originally selected encoder, and stop adaptive concurrency from expanding after a fallback.
- Fail video jobs on any logged decode-frame failure, empty output stream, or zero-byte staged output before the result can replace the destination.

### Changed

- Use generic NVIDIA NVDEC instead of selecting codec-specific CUVID decoders.
- Apply detected crops through the common `-filter:v:0` graph with software decoding, then calculate an even scaled height from the cropped dimensions so every encoder retains the cropped aspect ratio.
- Restore FFmpeg's protected hardware-frame ownership by removing unsafe direct decoder output and add a CUDA copy stage when no other CUDA video filter allocates a separate frame pool.
- Keep Streaming CQ tiers, target bitrate, maximum bitrate, and the 2x buffer rule unchanged: NVENC remains CQ 29 for 4K and 720p, CQ 28 for 1080p, and CQ 32 for Cellular.

## [2.2.1] - 2026-08-27

### Added

- Synchronize predefined defaults from the repository's `presets.ini` while the splash screen is visible. Remote contents are validated before an atomic replacement, with a managed app-data copy for read-only installations and safe offline fallback.

### Changed

- Tune Streaming NVENC output for quality-efficient HEVC with five B-frames, full-resolution multipass, the compatible 26-frame lookahead limit, temporal AQ, and no non-reference P-frames. Streaming at 1080p now uses CQ 28 while the existing 4K, 720p, and Cellular quality tiers remain unchanged.

## [2.2.0] - 2026-08-26

### Fixed

- Lock adaptive NVENC batch concurrency to the capacity calculated from the first 10-second single-encode FPS average. Later aggregate samples can prevent another job from starting but can no longer raise that initial ceiling.
- Make Cancel All interrupt active encoders, replacement cooldowns, and the adaptive sampler through one queue-wide cancellation path.

## [2.1.0] - 2026-08-26

### Added

- Add adaptive NVENC batch scheduling that samples aggregate average FPS every 10 seconds, reserves 200 FPS per active and proposed job, and respects the encoder session cap.
- Add smart episodic output names and series/year/season folder layouts for folder batches, including batches spanning multiple seasons.

### Changed

- Set Streaming maximum video rates to 5000 kbit/s for 1080p and 8000 kbit/s for 4K, with buffer size continuing to calculate from the preset multiplier.
- Use an available codec-specific NVIDIA CUVID decoder and its pre-input crop option for auto-crop, including inputs that contain attached cover art.
- Remove built-in and custom preset file/folder shortcuts from the gear menu.

### Fixed

- Accept valid auto-crop geometry whose cropped picture begins at the top-left edge.

## [2.0.1] - 2026-08-26

### Added

- Add encoder-family tune and quality defaults to `presets.ini`, including NVENC high-quality tuning and calibrated AMF, QSV, VA-API, VideoToolbox, and software quality targets.
- Add **Apply to all sources in queue** for propagating changed metadata fields across matching queued video or audio streams.

### Changed

- Run obsolete Windows installation cleanup on every packaged startup and keep only the current `app-<version>` directory.
- Delete archived runtime logs and reset the active log when it belongs to an older application version.
- Show encoder backend and decoder labels without malformed separators or codec implementation names.

## [2.0.0] - 2026-08-26

### Added

- Add encoder-aware P1–P7 speed controls and tune choices that map to native NVENC, QSV, AMF, VideoToolbox, x264, x265, and SVT-AV1 options where supported.
- Add encoder-specific B-frame, multipass, B-frame reference, adaptive B-frame, scene-cut, RC-lookahead, non-reference P-frame, spatial AQ, and temporal AQ controls.
- Show the selected software or hardware decoder path in the workspace status footer.
- Add editable built-in `presets.ini` and a separate per-user `custom_preset.ini` for named custom presets.

### Changed

- Use integer `0` and `1` for configuration booleans and keep configuration files free of comments.
- Update the Streaming video preset to use Opus at 96 kbit/s for stereo and 128 kbit/s for a surround downmix.
- Apply native auto-crop paths for CUDA/CUVID and QSV, with aspect-preserving software crop and hardware upload for AMF, VA-API, VideoToolbox, and CPU encoding.
- Refresh command previews immediately while controls are edited and retain the workspace scroll position across rendered changes.
- Include version 2.0.0 in Windows installer filenames.

## [1.2.1] - 2026-08-25

### Changed

- Use CQ 27 for Streaming jobs whose source or explicitly scaled output resolves to the 1080p profile.
- Force the Music Video workflow to use NVENC preset `p4` regardless of source resolution.
- Preserve the original filename stem for audio and music-video conversions without adding a converted prefix or suffix.

## [1.2.0] - 2026-08-25

### Added

- Add recursive audio-library processing with Streaming (Opus), Archive (libfdk_aac), and Passthrough presets.
- Preserve audio-library folder layouts under `converted`, retain original basenames, and copy matching `.lrc` lyric sidecars.
- Add surround downmix, high-frequency lossless resampling to 48 kHz, metadata retention controls, and batch ReplayGain normalization.
- Add automatic short music-video detection, a locked Music Video preset, automatic CEA-608/708 extraction, and 4K-only `2960:-2` scaling.

### Changed

- Run rsgain once, recursively, only after every audio encode in the queue succeeds; skip it after failure or cancellation.
- Preserve music-video metadata and copy attached cover artwork into the completed conversion while encoding only the primary video stream.
- Replace the encoder-specific checkbox label with persisted **Hardware Acceleration**; disabling it selects CPU video encode and decode.
- Reduce managed-runtime splash detail to **Verifying pre-requisites** and **Loading pre-requisites**.
- Remove obsolete installed application versions and legacy runtime libraries during Windows updates without touching user configuration.

### Fixed

- Make the persisted **Stable** Jellyfin FFmpeg selector and **Hardware Acceleration** checkbox independently toggleable from the gear menu.
- Keep audio-only workspaces focused on Summary, Audio, and Filters, and prevent passthrough settings from exposing invalid conversion controls.

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

[2.6.8]: https://github.com/eaforlife/media-converter/compare/v2.6.7...v2.6.8
[2.6.7]: https://github.com/eaforlife/media-converter/compare/v2.6.6...v2.6.7
[2.6.6]: https://github.com/eaforlife/media-converter/compare/v2.6.5...v2.6.6
[2.6.5]: https://github.com/eaforlife/media-converter/compare/v2.6.4...v2.6.5
[2.6.4]: https://github.com/eaforlife/media-converter/compare/v2.6.3...v2.6.4
[2.6.3]: https://github.com/eaforlife/media-converter/compare/v2.6.2...v2.6.3
[2.6.2]: https://github.com/eaforlife/media-converter/compare/v2.6.1...v2.6.2
[2.6.1]: https://github.com/eaforlife/media-converter/compare/v2.6.0...v2.6.1
[2.6.0]: https://github.com/eaforlife/media-converter/compare/v2.5.1...v2.6.0
[2.5.1]: https://github.com/eaforlife/media-converter/compare/v2.5.0...v2.5.1
[2.5.0]: https://github.com/eaforlife/media-converter/compare/v2.4.1...v2.5.0
[2.4.1]: https://github.com/eaforlife/media-converter/compare/v2.4.0...v2.4.1
[2.4.0]: https://github.com/eaforlife/media-converter/compare/v2.3.1...v2.4.0
[2.3.1]: https://github.com/eaforlife/media-converter/compare/v2.3.0...v2.3.1
[2.3.0]: https://github.com/eaforlife/media-converter/compare/v2.2.1...v2.3.0
[2.2.1]: https://github.com/eaforlife/media-converter/compare/v2.2.0...v2.2.1
[2.2.0]: https://github.com/eaforlife/media-converter/compare/v2.1.0...v2.2.0
[2.1.0]: https://github.com/eaforlife/media-converter/compare/v2.0.1...v2.1.0
[2.0.1]: https://github.com/eaforlife/media-converter/compare/v2.0.0...v2.0.1
[2.0.0]: https://github.com/eaforlife/media-converter/compare/v1.2.1...v2.0.0
[1.2.1]: https://github.com/eaforlife/media-converter/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/eaforlife/media-converter/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/eaforlife/media-converter/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/eaforlife/media-converter/compare/v0.4.0...v1.0.0
[0.4.0]: https://github.com/eaforlife/media-converter/compare/v0.3.0...v0.4.0
[0.3.2]: https://github.com/eaforlife/media-converter/compare/v0.3.1...v0.3.2
[0.3.1]: https://github.com/eaforlife/media-converter/compare/v0.3.0...v0.3.1
[0.3.0]: https://github.com/eaforlife/media-converter/releases/tag/v0.3.0
