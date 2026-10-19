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
- Keep preset parsing backward-compatible unless the task explicitly changes the file format. `presets.ini` has a leading `[Version: major.minor.patch]` freshness tag for remote preset updates; bump it when preset source content changes. Packaged builds read and write `config.ini` directly in `process.resourcesPath`; preserve `[System Capability Cache]` when updating its app-version header. Mutable app data is stored in the same resources directory for packaged builds and `.app-data/` in development. Windows uninstalls must never recursively delete `process.resourcesPath`.
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
- `[Version: major.minor.patch]` at the top of `presets.ini`: source freshness tag for named built-in presets.
- `[UI Defaults]`: default video preset, default codec, and Main10 initial state.
- `[Video Behavior]`: app-wide buffer multiplier (default 3× max rate). Buffer size is calculated from the selected codec max rate and is not stored separately.
- `[Video Output: 4k|1080p|720p|360p]`: output dimensions and H.264 bitrate/max-rate defaults; 360p is Cellular. These rates alone follow the selected output tier.
- `[Video Codec Rate Multipliers]`: max-rate and bitrate ratios against H.264: HEVC 0.5, HEVC Main10 0.6, AV1 0.75, AV1 10-bit 0.8. Buffer size follows the final max rate at the `[Video Behavior]` multiplier.
- `[Main10 Defaults]`: spatial AQ and B-frame defaults when the user enables 10-bit output.
- `[Media Extensions]`: supported input extensions.
- `[Audio Bitrates]` and `[Audio Filters]`: audio bitrate selector choices and app-wide filter templates. Audio codec, format, per-codec rates, and compression defaults live in each named preset section in `presets.ini`.
- `[Music Video Workflow]`: music-video detection and caption behavior.
- `[Video Filters]`: HDR tone-map filter templates.
- `[Encoder: <ffmpeg encoder id>]`: encoder labels, vendor/codec, platform availability, and supported Main10/High profiles.
- Packaged writable state is stored beside bundled resources: `config.ini` (including `[System Capability Cache]`), `presets.ini`, `managed-presets.ini`, `custom_preset.ini`, `config` (saved UI settings), and `app.log`. This avoids Electron's roaming `userData` folder. Squirrel versions use separate install directories, so app updates can replace this state; migrate prior install data before deleting old version directories if future behavior must preserve it.
- `[UI Defaults]`, `[Video Behavior]`, `[Video Output: *]`, `[Video Codec Rate Multipliers]`, and `[Main10 Defaults]` are parsed by `src/config.ts` and drive renderer defaults. The capability cache is stored in `[System Capability Cache]` in the same bundled `config.ini`; `cache_tag=1` and the GPU driver version identify a reusable cache. Rescan when the cache is absent, its tag is unsupported, or the driver version changes. Keep named-preset quality, tune, speed, format, audio, and intentional advanced-setting overrides in `presets.ini`.
- `presets.ini` must not repeat app-wide output tiers, bitrate rates/ratios, or buffer multiplier. Legacy output sections and bitrate fields remain parser-compatible for older preset files, but the UI uses `config.ini` values. Keep `presets.ini` limited to named-preset overrides and settings that intentionally differ between presets, including audio codec, format, per-codec rates, and compression defaults.
- The Video tab's language selector stays editable while video processing is enabled; `und` emits an undefined stream language. Video dispositions remain editable only in metadata-only mode.
- Electron's taskbar bar is queue-wide: average each queued job's completion, count finished jobs as 100%, and reset at queue termination. rsgain's percentage output is normalized into the app's encode progress events; do not pass through its terminal bar as the queue bar.
- NVIDIA decode selects the matching available `*_cuvid` decoder (NVDEC) by default. Keep CUDA as FFmpeg's hardware-frame/filter device; crop is passed to CUVID only when that decoder supports it.
- Video scanning currently runs ffprobe and, for video files, two short-lived FFmpeg tasks in parallel: a 320px thumbnail and up to 100 crop-detection frames. Video scan concurrency is capped at two files; audio-only scan concurrency is CPU-bounded up to 12. Preserve previews and crop suggestions when optimizing scan latency. A future lower-resource option is to defer crop detection until a source is selected or combine analysis passes, while keeping failures non-fatal.
- No FFmpeg encoder or hardware capability test should remain resident while idle. Each subprocess exits after its task; on Windows Electron hardware acceleration is disabled. Do not claim zero GPU/VRAM use while the app is open, since the OS/window compositor and driver may still allocate resources. Keep GPU work bounded to active scans/encodes and release preview files when sources are cleared.
- NVENC preset speed is mapped from the preset's `encoder_speed` (and optional tier-specific overrides). Faster NVENC throughput can be traded for quality/bitrate efficiency by choosing a faster speed preset and disabling multipass/lookahead/AQ features; these are preset-level quality decisions, not universally safe syntax tweaks. Streaming currently favors compression quality with `rc_lookahead=26`, AQ, and tier-specific multipass. Preserve those defaults unless the user explicitly requests a faster/lower-efficiency profile; avoid adding redundant CUDA flags because the existing NVDEC/CUDA path already selects hardware decode and CUDA frames.
- Editing any knob keeps the selected preset active, so codec changes continue to resolve that preset's codec/tier defaults. Max Rate edits recalculate the buffer at `max_rate × buffer_multiplier`. **Add preset** opens the name/save controls; saved presets include video, audio, stream, processing, and filter settings. Custom video rates are stored as H.264 baseline values and scaled for the saved codec/bit depth when applied.
- The stable/prerelease Jellyfin FFmpeg selector is shown only when the prerelease major.minor is newer than stable; matching major.minor versions use stable and do not download the prerelease.
- If the remote urgent update policy requires a newer app version, startup offers **Update and restart** or **Exit** before runtime initialization. The update choice runs the standard updater, installs the downloaded update, and restarts; updater failure exits so the minimum version remains enforced. Keep policy enforcement in the startup update IPC path so the updater can initialize before the choice is acted on.
- The Streaming preset uses NVENC CQ 32 at every output tier. Keep the base and tier-specific `quality_nvenc*` keys aligned when changing that preset's CQ.
- Tests do not provide runtime defaults: `config.test.ts` and `video-output-profile.test.ts` load `config.ini`, while preset tests load `presets.ini` and verify parsing/resolution. Keep each knob's expected default in one focused invariant test where possible; avoid repeating the same exact CQ/rate value in parser tests and resolved-output tests. Make synchronization fixtures alter content independently of a particular knob value so normal default edits do not silently invalidate the fixture.
- `EMPTY_APP_CONFIGURATION` in `src/config.ts` is only the pre-load fallback; packaged/runtime defaults come from parsed `config.ini`. Do not treat test expectations or the fallback object as a second runtime configuration source.

Current video defaults: config selects Streaming, HEVC, Main10 off. Main10/10-bit output uses spatial AQ 6 and disables B-frames when enabled. H.264 max rates are 4K 10000, 1080p 7500, 720p 4000, Cellular 2500 kbit/s; HEVC is 0.5x, HEVC Main10 0.6x, AV1 0.75x, and AV1 10-bit 0.8x H.264. Rate and buffer values follow the output tier. Other knobs should not depend on source/downscale resolution unless documented in config or the preset.

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
