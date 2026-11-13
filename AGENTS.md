# Agent guide

## Project

EA Media Tools is an Electron desktop app written in TypeScript. Electron Forge builds it with Vite. Node.js 24 is required; use npm and keep `package-lock.json` in sync with dependency changes.

## Layout

- `src/main.ts`: Electron main process, app lifecycle, windows, IPC registration.
- `src/preload.ts`: renderer bridge; expose narrow, typed APIs only.
- `src/renderer.ts`, `src/index.css`, `index.html`: renderer UI and styling.
- Other `src/*.ts` files: media, encoding, configuration, presets, and workflow modules. Most have a colocated `*.test.ts` file.
- `src/shared-types.ts`: types shared across process boundaries.
- `src/app-storage.ts`: packaged storage location for writable app data.
- `forge.config.ts`, `vite.*.config.mts`, `tsconfig.json`, `eslint.config.mjs`: build and tooling configuration.
- `scripts/`: packaging helpers; `.github/workflows/`: CI and release automation.
- Root `config.ini` and `presets.ini` are packaged runtime data, not source modules.
- `.vite/`, `out/`, and `node_modules/` are generated or installed; do not edit them.

## Change guidance

- Read the relevant implementation and its tests before changing behavior. Preserve Electron main/preload/renderer boundaries and validate all IPC inputs.
- Prefer small, cohesive modules. Keep pure media/workflow logic out of `main.ts` and DOM/UI logic out of non-renderer modules.
- Add or update a colocated `src/<module>.test.ts` for behavior changes. Keep `package.json`'s explicit test file list in sync when adding a test file.
- Keep preset parsing backward-compatible unless the task explicitly changes the file format. `presets.ini` has a leading `[Version: major.minor.patch]` freshness tag for remote preset updates; bump it when preset source content changes. Packaged builds read and write `config.ini` directly in `process.resourcesPath`; source refresh replaces managed defaults while preserving `[Personalized Defaults]` and `[System Capability Cache]` verbatim. The personalized section has its independent `defaults_tag` schema marker. App update/install events and app-version changes clear only the hardware cache so hardware is retested; source-only config refresh preserves both user settings and cache. Mutable app data is stored in the same resources directory for packaged builds and `.app-data/` in development. Windows uninstalls must never recursively delete `process.resourcesPath`.
- Avoid unrelated edits to release metadata, runtime data, generated output, and documentation.

## Project decisions and configuration

- Treat this file as the compact decision log for future agents. When adding a reusable function, changing a project-wide convention, or fixing a significant bug, record the resulting rule here so later work can avoid rediscovering it. Keep entries concise and update stale guidance instead of appending history.
- Record every frontend setting or knob's definition, default, and scope here, including whether it is user-editable and whether source/output resolution affects it. When adding or changing a knob, update this guide in the same change.
- `config.ini` is the source of truth for app/UI defaults, knob definitions, runtime/API settings, and system capability cache policy. If the UI needs a default or decision, parse it from this file; do not duplicate it as a renderer constant.
- `presets.ini` is the source of truth for named preset defaults and their intentionally preset-specific choices. Keep it limited to values that differ by preset; do not repeat app-wide defaults or codec/resolution rate formulas there.
- Document each `config.ini` section and any new file/key the app reads here. Validate INI values in the parser and update its tests when the schema changes.
- Version bumps are explicit user decisions. When asked to increment the current version, advance the patch by one (`2.8.7` to `2.8.8`); when the next patch would be `100` (`2.8.99`), roll to the next minor at `.0` (`2.9.0`). An explicitly requested next minor/major such as `2.9`, `2.10`, or `3.0.0` takes precedence and is normalized to three components. Never bump a version for ordinary changes without a request.

## Current configuration map

- `[App]`: app identity, repositories, remote config/preset sources, and runtime release APIs.
- `[App Version: major.minor.patch]` at the top of `config.ini`: identifies the app version that supplied the managed base config; it is not a source freshness tag.
- `[Personalized Defaults]`: `defaults_tag` identifies the settings payload schema; `settings_json` is base64-encoded JSON for user-editable app preferences and the active working preset. This section is preserved across source updates and migrated from the previous app bundle before its directory is removed. `custom_preset.ini` continues to store named custom presets.
- `[Version: major.minor.patch]` at the top of `presets.ini`: source freshness tag for named built-in presets.
- `[UI Defaults]`: default video preset, default codec, and Main10 initial state. Main10 uses `default_main10`; source HDR/Main10 and named-preset choices can still request it when supported.
- `[Video Behavior]`: app-wide buffer multiplier (default 3× max rate). Buffer size is calculated from the selected codec max rate and is not stored separately.
- `[Encode Concurrency]`: minimum aggregate encode FPS required per simultaneous encode (default 300 FPS). A missing or zero value disables concurrent encoding and allows one job at a time.
- `[Job Behavior Defaults]`: required fallback values for including audio/subtitles, stripping metadata, retaining surround while adding a stereo downmix, and downmixing surround sources. All five keys are required; startup rejects a config missing any of them. Presets may override these values with `remux_audio`, `remux_subtitles`, `strip_metadata`, `do_not_replace_audio`, or `downmix_to_stereo` when a named preset intentionally differs.
- `[Video Output: 4k|1080p|720p|360p]`: output dimensions and H.264 bitrate/max-rate defaults; 360p is Cellular. These rates alone follow the selected output tier. Current width defaults are 2900 (4K tier), 1890 (1080p tier), 1300 (720p tier), and height 540 (Cellular).
- `[Video Codec Rate Multipliers]`: max-rate and bitrate ratios against H.264: HEVC 0.5, HEVC Main10 0.45, AV1 0.30, AV1 10-bit 0.20. Buffer size follows the final max rate at the `[Video Behavior]` multiplier.
- `[Main10 Defaults]`: spatial AQ and B-frame defaults when the user enables 10-bit output; `streaming_spatial_aq` is the Streaming-specific spatial AQ value for 10-bit output.
- `[Media Extensions]`: supported input extensions.
- `[Audio Bitrates]`: AAC/Opus selector choices plus `aac_multichannel_base`, whose rates are stereo-equivalent AAC values scaled by `source channels / 2` for encoded multichannel audio. `[Audio Filters]` contains app-wide filter templates. Audio codec, format, per-codec rates, and compression defaults live in each named preset section in `presets.ini`.
- `[Audio Filters]` is the source of surround downmix, timestamp resampling, compressor, and peak-limiter filter expressions; preserve source stream language metadata when encoding multichannel AAC.
- `[Music Video Workflow]`: music-video detection and caption behavior.
- `[Video Filters]`: HDR tone-map filter templates.
- `[Encoder: <ffmpeg encoder id>]`: encoder labels, vendor/codec, platform availability, and supported Main10/High profiles.
- Packaged writable state is stored beside bundled resources: `config.ini` (including `[Personalized Defaults]` and `[System Capability Cache]`), `presets.ini`, `managed-presets.ini`, `custom_preset.ini`, and `app.log`. This avoids Electron's roaming `userData` folder. Before removing prior Squirrel version directories, migrate personalized defaults and `custom_preset.ini` into the current resources folder. A legacy XML file named `config` is read only for first migration. Remove legacy `%APPDATA%/EA Media Tools`, `%APPDATA%/EA Media Conversion Tools`, and `%LOCALAPPDATA%/ea_media_tools` folders after migration, while protecting any path that contains the active install. App-version changes and reinstalls start without the hardware cache; a changed GPU driver also invalidates it.
- `[UI Defaults]`, `[Video Behavior]`, `[Encode Concurrency]`, `[Video Output: *]`, `[Video Codec Rate Multipliers]`, and `[Main10 Defaults]` are parsed by `src/config.ts` and drive renderer/runtime behavior. The capability cache is stored in `[System Capability Cache]` in the same bundled `config.ini`; `cache_tag=1` and the GPU driver version identify a reusable cache. Rescan when the cache is absent, its tag is unsupported, or the driver version changes. Keep named-preset quality, tune, speed, format, audio, and intentional advanced-setting overrides in `presets.ini`.
- Streaming defaults to HEVC Main10. Its 4K NVENC CQ override is `quality_nvenc_4k` in `[Streaming]`; use per-tier preset keys rather than adding renderer checks for a named preset's tier-specific quality.
- `loadAppConfiguration()` refreshes source defaults from `[App] config_source_url` at startup while retaining personalized settings and the capability cache. Built-in presets refresh from `[App] preset_source_url` at startup when their `[Version: *]` tag is newer. Both remote files are validated before use; required config defaults must exist and parse successfully.
- `presets.ini` must not define app-wide output tiers, codec ratios, or buffer multiplier. It may define named-preset-specific H.264 baseline max-rate and quality overrides by output tier; `src/renderer.ts` applies codec ratios from `config.ini` and derives the buffer from the resulting rate. Current bundled presets do not contain legacy `[Output: *]` sections.
- The Video tab's language selector stays editable while video processing is enabled; `und` emits an undefined stream language. Video dispositions remain editable only in metadata-only mode.
- Output behavior checkboxes in the video Filters tab directly control output stream mapping (`-an`/`-sn`) and metadata stripping. Their defaults come from `[Job Behavior Defaults]`; named preset overrides come from `presets.ini`. Music Video only starts CCExtractor when scanning detected a CEA-608/708 stream, the caption is selected, subtitle processing is enabled, and subtitle output is included.
- Surround controls use enabled audio tracks from the selected source. Downmix and compression are shown off and disabled when no enabled surround stream can use them; they become editable when an eligible surround stream is being encoded.
- In video job behavior, “Keep surround audio and add a stereo downmix” is cleared and disabled when the selected source has no enabled surround track. When active, the original multichannel stream is retained without a downmix filter; its codec choices are AAC or copy (Opus is hidden), AAC rates scale from the configured stereo-equivalent list by `channels / 2`, output dispositions on the retained stream are cleared, and the separately generated stereo stream remains editable.
- In audio-only output, when downmixing is off and any source audio stream has more than two channels, hide Opus, select AAC for encoded output, and offer `[Audio Bitrates] aac_multichannel_base` choices scaled by the source's highest channel count. With downmix enabled, use the selected preset codec and its normal bitrate choices.
- With “Keep surround audio and add a stereo downmix” active, the Audio tab has independent Include track controls for each original surround stream and its generated stereo downmix. Turning off the original does not suppress the downmix, and vice versa.
- “Keep surround audio and add a stereo downmix” retains the surround output and adds an encoded two-channel track. The Audio tab exposes that generated track's codec, bitrate, output flags, and language; its language starts from the source stream. **Start New** in the pre-encode workspace releases source previews, clears the queued sources and per-source settings, and returns to the welcome page.
- Electron's taskbar bar is queue-wide: average each queued job's completion, count finished jobs as 100%, and reset at queue termination. rsgain's percentage output is normalized into the app's encode progress events; do not pass through its terminal bar as the queue bar.
- NVIDIA decode selects the matching available `*_cuvid` decoder (NVDEC) by default. Keep CUDA as FFmpeg's hardware-frame/filter device; crop is passed to CUVID only when that decoder supports it.
- Video scanning currently runs ffprobe and, for video files, two short-lived FFmpeg tasks in parallel: a 320px thumbnail and up to 100 crop-detection frames. Video scan concurrency is capped at two files; audio-only scan concurrency is CPU-bounded up to 12. Preserve previews and crop suggestions when optimizing scan latency. A future lower-resource option is to defer crop detection until a source is selected or combine analysis passes, while keeping failures non-fatal.
- No FFmpeg encoder or hardware capability test should remain resident while idle. Each subprocess exits after its task; on Windows Electron hardware acceleration is disabled. Do not claim zero GPU/VRAM use while the app is open, since the OS/window compositor and driver may still allocate resources. Keep GPU work bounded to active scans/encodes and release preview files when sources are cleared.
- NVENC preset speed is mapped from the preset's `encoder_speed` (and optional tier-specific overrides). Faster NVENC throughput can be traded for quality/bitrate efficiency by choosing a faster speed preset and disabling multipass/lookahead/AQ features; these are preset-level quality decisions, not universally safe syntax tweaks. Streaming currently favors compression quality with `rc_lookahead=26`, AQ, and tier-specific multipass. Preserve those defaults unless the user explicitly requests a faster/lower-efficiency profile; avoid adding redundant CUDA flags because the existing NVDEC/CUDA path already selects hardware decode and CUDA frames.
- Editing any knob keeps the selected preset active, so codec changes continue to resolve that preset's codec/tier defaults. Max Rate edits recalculate the buffer at `max_rate × buffer_multiplier`. **Add preset** opens the name/save controls; saved presets include video, audio, stream, processing, and filter settings. Custom video rates are stored as H.264 baseline values and scaled for the saved codec/bit depth when applied.
- The stable/prerelease Jellyfin FFmpeg selector is shown only when the prerelease major.minor is newer than stable; matching major.minor versions use stable and do not download the prerelease.
- If the remote urgent update policy requires a newer app version, startup offers **Update and restart** or **Exit** before runtime initialization. The update choice runs the standard updater, installs the downloaded update, and restarts; updater failure exits so the minimum version remains enforced. Keep policy enforcement in the startup update IPC path so the updater can initialize before the choice is acted on.
- `updatepolicy` is the remote urgent-update gate; set `minVersion` to the release version whenever a release must be required before the app can continue.
- The Streaming preset uses NVENC CQ 33 at 4K and its base CQ 32 at other tiers; its H.264 max-rate baseline is 10000 kbit/s at 4K and the remaining tiers inherit `[Video Output: *]`. It defaults to Main10 when supported, uses scene-cut detection off, B-frames on, and spatial AQ 8; 10-bit output also uses spatial AQ 8 from `[Main10 Defaults] streaming_spatial_aq`. Keep the base and tier-specific `quality_nvenc*` keys aligned when changing that preset's CQ.
- Music Video uses NVENC CQ 26 and P6 (`encoder_speed=6`), with H.264 max-rate baselines of 11000 kbit/s at 4K and 9000 kbit/s at 1080p; other tiers inherit `[Video Output: *]`. It has Opus 128 kbit/s audio, defaults to HEVC Main10 when supported, uses spatial AQ 8, scene-cut detection off, and B-frames on. Auto Crop and Auto Scale are user-toggleable; sources at or below 1080p are not scaled, while sources above 1080p use the Music Video 4K resolution from `presets.ini`. Subtitles default enabled only for SRT/SubRip and WebVTT; unsupported text formats such as ASS/SSA are excluded from MP4 `mov_text` output. CCExtractor runs only when configured on, the scan detects a CEA-608/708 stream, a detected caption is selected, and subtitle output is enabled; captions are converted to UTF-8 SRT before muxing as SRT, WebVTT, or `mov_text` for the selected container. CCExtractor receives options before input paths; on Windows, stage non-ASCII source paths through a temporary ASCII path, keep its temporary SRT there until muxing completes, and stream warning/error diagnostics into the live encode output.
- Tests do not provide runtime defaults: when checking configured behavior, load `config.ini` or `presets.ini` and derive expected values from the relevant INI entry instead of repeating its current literal. Keep independent algorithm tests on synthetic inputs, and make malformed/synchronization fixtures mutate values by key or pattern so default edits do not silently invalidate them. A blank boolean in `presets.ini` means false (unchecked); a missing optional preset override still inherits its app default, and malformed nonblank values remain errors.
- `EMPTY_APP_CONFIGURATION` in `src/config.ts` is only the pre-load fallback; packaged/runtime defaults come from parsed `config.ini`. Do not treat test expectations or the fallback object as a second runtime configuration source.

Current video defaults: config selects Streaming, HEVC, and Main10 on where supported. Metadata stripping is enabled by default. Main10/10-bit output uses spatial AQ 8 and enables B-frames. Base H.264 max rates are 4K 8000, 1080p 7500, 720p 4000, Cellular 2500 kbit/s; named presets may override H.264 max-rate baselines per tier in `presets.ini`. HEVC is 0.5x, HEVC Main10 0.45x, AV1 0.30x, and AV1 10-bit 0.20x H.264. Rate and buffer values follow the output tier. Other knobs should not depend on source/downscale resolution unless documented in config or the preset.

Runtime target: compare stable and prerelease Jellyfin FFmpeg major.minor versions. When they match, use stable and do not expose/download prerelease. When prerelease is newer by major.minor, expose the toggle and keep both channels installed for switching. Persist GPU driver version and tested decoder/encoder capabilities; repeat hardware tests only when the relevant driver/runtime identity changes. These are desired behaviors; verify implementation before assuming they are complete.

## Commands

- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript check
- `npm test` — Node test runner
- `npm run check` — lint, typecheck, and tests
- `npm start` — launch the app

Run the narrowest relevant checks for a change, then `npm run check` when practical. Report checks that were not run.

## Keep agent context efficient

- Start with `git status --short` and inspect only files connected to the task; do not read the full README or scan all of `src/` by default.
- Use `rg` to find symbols and callers, then read focused sections. Follow imports only as far as needed to understand the change.
- Prefer the source and tests over release notes or user-facing documentation for implementation details.
- Do not restate this guide in task notes or create extra repo-wide guidance files without a specific need.
