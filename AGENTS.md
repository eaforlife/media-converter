# Agent guide

## Project

EA Media Tools is an Electron desktop app written in TypeScript. Electron Forge builds it with Vite. Node.js 24 is required; use npm and keep `package-lock.json` in sync with dependency changes.

## Layout

- `src/main.ts`: Electron main process, app lifecycle, windows, IPC registration.
- `src/preload.ts`: renderer bridge; expose narrow, typed APIs only.
- `src/renderer.ts`, `src/index.css`, `index.html`: renderer UI and styling.
- Other `src/*.ts` files: media, encoding, configuration, presets, and workflow modules. Most have a colocated `*.test.ts` file.
- `src/shared-types.ts`: types shared across process boundaries.
- `forge.config.ts`, `vite.*.config.mts`, `tsconfig.json`, `eslint.config.mjs`: build and tooling configuration.
- `scripts/`: packaging helpers; `.github/workflows/`: CI and release automation.
- Root `config.ini` and `presets.ini` are packaged runtime data, not source modules.
- `.vite/`, `out/`, and `node_modules/` are generated or installed; do not edit them.

## Change guidance

- Read the relevant implementation and its tests before changing behavior. Preserve Electron main/preload/renderer boundaries and validate all IPC inputs.
- Prefer small, cohesive modules. Keep pure media/workflow logic out of `main.ts` and DOM/UI logic out of non-renderer modules.
- Add or update a colocated `src/<module>.test.ts` for behavior changes. Keep `package.json`'s explicit test file list in sync when adding a test file.
- Keep configuration and preset parsing backward-compatible unless the task explicitly changes the file format.
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
- `[UI Defaults]`: default video preset, default codec, and Main10 initial state.
- `[Video Output: 4k|1080p|720p|360p]`: resolution and H.264 bitrate, max-rate, and buffer values; the 360p tier is used by Cellular.
- `[Video Codec Rate Multipliers]`: ratios applied to output-tier H.264 rate and buffer values: HEVC 0.5, HEVC Main10 0.6, AV1 0.75, AV1 10-bit 0.8.
- `[Main10 Defaults]`: spatial AQ and B-frame defaults when the user enables 10-bit output.
- `[Media Extensions]`: supported input extensions.
- `[Audio Preset: *]`, `[Audio Bitrates]`, `[Audio Filters]`: audio workflow defaults, choices, and filter templates.
- `[Music Video Workflow]`: music-video detection and caption behavior.
- `[Video Filters]`: HDR tone-map filter templates.
- `[Encoder: <ffmpeg encoder id>]`: encoder labels, vendor/codec, platform availability, and supported Main10/High profiles.
- `[UI Defaults]`, `[Video Output: *]`, `[Video Codec Rate Multipliers]`, and `[Main10 Defaults]` are parsed by `src/config.ts` and drive renderer defaults. Keep preset-specific quality, tune, speed, format, and advanced settings in `presets.ini`.
- The Video tab's language selector stays editable while video processing is enabled; `und` emits an undefined stream language. Video dispositions remain editable only in metadata-only mode.
- Electron's taskbar bar is queue-wide: average each queued job's completion, count finished jobs as 100%, and reset at queue termination. rsgain's percentage output is normalized into the app's encode progress events; do not pass through its terminal bar as the queue bar.

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
