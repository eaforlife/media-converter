# EA Media Tools

EA Media Tools is a desktop video and audio converter powered by Jellyfin FFmpeg. It inspects video, audio, subtitle, chapter, HDR, and Dolby Vision metadata; selects hardware or CPU processing; and runs queued conversions with live progress information.

Version 2.6.2, codename **jaguar**, is the current stable release. It supports video files, short music videos with attached artwork, and recursive audio libraries. Hardware acceleration is enabled by default but can be disabled for CPU video encoding and decoding.

## Download

Download the newest build from the [GitHub Releases page](https://github.com/eaforlife/media-converter/releases).

Choose the asset that matches your operating system and CPU:

| System | Intel/AMD 64-bit | ARM 64-bit |
| --- | --- | --- |
| Windows | `EA-Media-Tools-2.6.2-x64-Setup.exe` | `EA-Media-Tools-2.6.2-arm64-Setup.exe` |
| macOS | ZIP containing `darwin-x64` | ZIP containing `darwin-arm64` for Apple silicon |
| Debian/Ubuntu | `.deb` containing `amd64` | `.deb` containing `arm64` |

Do not download `.nupkg` or `RELEASES`; those files are used by the Windows updater.

## Install

### Windows

1. Download the correct `Setup.exe` asset.
2. Double-click the installer and wait for EA Media Tools to open.
3. If Microsoft Defender SmartScreen warns about an unrecognized app, verify that the file came from this repository before selecting **More info** and **Run anyway**.

The installer is not digitally signed. Remove the app later from **Settings > Apps > Installed apps > EA Media Tools**. The uninstaller also clears the app-managed settings, runtime, cache, cookies, logs, and previews.

### macOS

1. Download the ZIP for `darwin-arm64` on Apple silicon or `darwin-x64` on an Intel Mac.
2. Extract the ZIP and move **EA Media Tools.app** into **Applications**.
3. On first launch, Control-click the app, select **Open**, and confirm the prompt if Gatekeeper blocks the unsigned app.

The macOS app is not signed or notarized. To uninstall it, quit the app and move it from **Applications** to the Trash.

### Debian and Ubuntu

Install the downloaded package from a terminal. Replace the filename with the asset you downloaded:

```bash
sudo apt install ./ea-media-tools_2.6.2_amd64.deb
```

ARM64 systems use the package ending in `arm64.deb`. Launch **EA Media Tools** from the desktop application menu. Remove it with:

```bash
sudo apt remove ea-media-tools
```

## First launch

An internet connection is required the first time the packaged app runs. Before other initialization, the splash screen waits for the application update check to finish. EA Media Tools then downloads and verifies both the latest stable and latest prerelease portable builds from the official [Jellyfin FFmpeg releases](https://github.com/jellyfin/jellyfin-ffmpeg/releases). They are installed separately under `lib/ffmpeg-stable` and `lib/ffmpeg-unstable`; the welcome-page gear menu has a persisted **Stable** switch that selects the active runtime. The status bar shows the selected channel and Jellyfin release version with a green stable or yellow prerelease indicator.

The managed runtime setup also installs [rsgain 3.7](https://github.com/complexlogic/rsgain/releases/tag/v3.7) under `lib/rsgain`. After every audio encode in a library succeeds, enabled normalization runs once against the selected output root and includes its subfolders. On platforms with a compatible official portable build, [CCExtractor](https://github.com/CCExtractor/ccextractor/releases) is installed under `lib/ccextractor` and is used automatically for detected music videos. Temporary caption files are removed after success, failure, cancellation, and update restart.

Audio folders are scanned recursively. Streaming outputs 96 kbps Opus, or 128 kbps when surround audio is downmixed; Archive outputs 224 kbps libfdk_aac, or 256 kbps for a surround downmix. Converted files retain their source basename and relative artist/album layout beneath `converted`, and matching `.lrc` lyric files are copied beside them. Passthrough leaves the source files in place and can still run library normalization.

For sources with more than two channels, enabled dynamic range compression runs immediately after a coefficient-normalized stereo downmix. It uses [Feishin's Default compressor preset](https://github.com/jeffvli/feishin/blob/development/src/renderer/features/settings/components/playback/eq-settings.tsx): -24 dB threshold, 4:1 ratio, 20 ms attack, 250 ms release, +6 dB makeup gain, and a 2.83 dB knee. A lookahead limiter prevents compressed peaks from clipping, and every encoded audio track uses timestamp-aware resampling so gaps or overlaps do not become audible choppiness. The option is available in the Filters tab. It defaults on for Regular, Streaming, Cellular, Music Video, and audio-only Streaming, and off for Archive and Passthrough.

The Streaming video preset also uses Opus: 96 kbps for a stereo source and 128 kbps for a surround downmix. Its 3x bitrate buffer and spatial AQ strength 12 give difficult dark scenes more short-term bitrate flexibility.

Transcoded MP4 video places the playback index at the beginning, adds a keyframe at least every five seconds for more responsive seeking and Jellyfin segment boundaries, and marks HEVC video as `hvc1` for broader Apple and Safari direct-play compatibility. Stream-copy operations retain the source keyframe layout.

Videos shorter than eight minutes with attached cover artwork use the Music Video workflow. It preserves metadata and the original filename stem, copies the cover artwork into the finished conversion, checks embedded CEA-608/708 captions automatically, uses P6 with a 7000 kbps maximum rate for 1080p sources and P6 with an 11000 kbps maximum rate for 4K sources, and scales only 4K sources to `2960:-2`.

The app then checks the GPU driving the primary physical display. Virtual and secondary display adapters are ignored and recorded in **View Logs**. An encoder appears only after the corresponding Jellyfin FFmpeg flag completes an actual test encode on the installed hardware.

Folder analysis uses asynchronous directory and file indexing and reports discovery, indexing, and media-inspection counts in the animated picker overlay. Audio-only libraries inspect up to 12 files at once, bounded by available CPU parallelism; video analysis remains capped at two concurrent files. Single-file, multi-file, and folder modes scan beside each video for UTF-8 SRT, ASS, SSA, and WebVTT sidecars with the same basename. `Show A.srt` and `Show A.en.default.srt` match `Show A.mkv`, while a same-named file in another season directory does not. Two- or three-letter language codes set the displayed language; `default`, `forced`, and `sdh` set the corresponding subtitle flags. Sidecars appear immediately in the subtitle tab, can also be imported manually, and MP4 output converts text subtitles to `mov_text`.

With smart naming enabled, sources containing season and episode numbers use the series/year/season layout. A source without both numbers is treated as a movie and uses `converted/Title (Year)/Title.ext`, omitting the year suffix when none can be parsed.

Simultaneous encoding is enabled by default for batches and can be switched off from the gear menu after multiple sources are loaded; it is intentionally absent from the splash menu. When disabled, every queue runs one file at a time. An enabled NVENC-only batch begins with one encode and measures its average speed for 10 seconds. That first result creates a fixed ceiling of `floor(average FPS / 200)`, also bounded by the supported NVENC session cap. Later samples can delay expansion but cannot raise that initial ceiling. Audio-only batches process up to four files at once. Other encoder families remain serial because the app does not yet have a reliable session-capability signal for them.

The encode window keeps a separate progress page for every queued file. Browse pages with **Previous** and **Next** to inspect pending, active, completed, cancelled, or failed jobs. **Current bitrate** is calculated from consecutive FFmpeg size/time samples, so variable-bitrate relaxation on easy scenes is visible instead of only the cumulative average. **Live Process Output** contains every FFmpeg or rsgain command as it starts; executable and media paths are displayed as `ffmpeg`, `rsgain`, `<input>`, `<output>`, and `<library>`. **Start New** becomes available after the queue settles. **Done** appears only after every job has completed or cancelled, then waits for active workers and partial-output cleanup before closing the app.

Video, audio, and subtitle tabs each have a processing checkbox. Checked sections use their configured encoder settings; unchecked sections copy every source stream without re-encoding. Audio and subtitle languages can be set during conversion, including when FFprobe reports them as undefined. Only one audio track and one subtitle track can hold the default and forced flags; when those flags begin on different tracks, the first flagged track inherits both, while hearing-impaired flags remain independent. Uncheck all three sections to enter metadata-only mode, where stream languages and dispositions can be edited and UTF-8 subtitle files can be imported. The app creates a same-directory `_tmp00` (or queue-indexed) stream copy, installs it only after FFmpeg succeeds, and restores the original if replacement cannot complete.

Advanced video controls are selected for the active encoder. H.264 and HEVC NVENC expose B-frame count, multipass, B-frame references, adaptive B-frames, scene-cut detection, RC lookahead, non-reference P-frames, spatial AQ, and temporal AQ. AV1 NVENC exposes the same supported analysis controls except B-frame count, because Jellyfin FFmpeg 7.1 and 8.1 do not expose an AV1 NVENC `-bf` option. QSV, AMF, and software encoders show only controls with an encoder-specific FFmpeg mapping; unsupported flags are hidden and never sent to FFmpeg. P1-P7 speed and Tune controls follow the same rule. The top bar reports the decoder selected for the current source.

While the splash screen is visible, packaged builds fetch `presets.ini` from the repository's `main` branch, validate its commit marker and every predefined value, and compare it with the installed copy. A changed file replaces the installed copy atomically. If the installation directory is read-only, the validated file is stored as `managed-presets.ini` in the platform application-data directory and used instead. A network or validation failure retains the last valid managed copy, or the bundled copy when no managed copy exists. Preset synchronization events include the active preset commit marker in the compact one-event-per-line activity log.

Named custom presets are stored separately in the platform application-data directory as `custom_preset.ini`; that file is created only after the first custom preset is saved. Changes take effect after restarting the app.

## How to customize presets

The repository's `presets.ini` is authoritative for predefined defaults, so local edits to the installed copy are replaced at the next online startup. To keep personal settings, change a built-in value in the app and save it as a named custom preset. Configuration files contain data only and must not include comments. The first section is a validated source marker such as `[Version: 79c799a]`; it is metadata and never appears in the preset selector.

The `[Output: 4k]`, `[Output: 1080p]`, `[Output: 720p]`, and `[Output: 360p]` sections define each tier's resolution, target `video_bitrate`, and `max_rate`. Each built-in preset also has `frame_rate`: `passthrough` preserves source timing, while Streaming and Cellular use `23.976`. The Video-tab override is disabled and off below that target, enabled and off when the source matches it, and enabled and on above it; switching it off always restores passthrough. Enabled conversion emits exact `24000/1001` constant-frame-rate timing. Older app versions safely ignore `frame_rate`, and new versions treat older preset files without the key as passthrough. Boolean fields use `0` for disabled and `1` for enabled, including `bitrate_control` and `dynamic_range_compression`. `encoder_speed` accepts `1` through `7`, where P1 is fastest and P7 is slowest. Optional `preferred_video_codec_<tier>`, `encoder_speed_<tier>`, `resolution_<tier>`, `video_bitrate_<tier>`, and `max_rate_<tier>` values override the shared preset for one output tier. Codec-specific `encoder_speed_<codec>_<tier>`, `video_bitrate_<codec>_<tier>`, and `max_rate_<codec>_<tier>` values take precedence, where `<codec>` is `h264`, `hevc`, or `av1`. `profile_<codec>` selects an FFmpeg output profile, such as `profile_h264=high`; codec-specific advanced values such as `b_frames_av1=0` override the shared advanced stack. EA Media Tools maps speed levels to native NVENC, QSV, AMF, VideoToolbox, x264, x265, or SVT-AV1 settings. Tune defaults use the `tune_nvenc`, `tune_amf`, `tune_qsv`, `tune_vaapi`, `tune_videotoolbox`, and `tune_software` keys; an empty value means the encoder has no general-purpose equivalent. Modern NVENC combines the selected P-level with `tune_nvenc=hq`; the deprecated `-preset hq` alias is not used because it maps to P7 and would bypass the speed control.

Quality defaults use matching `quality_nvenc`, `quality_amf`, `quality_qsv`, `quality_vaapi`, `quality_videotoolbox`, and `quality_software` keys. A `quality_<family>_<tier>` key overrides that value for one tier; Streaming declares every tier explicitly, including NVENC CQ. `delivery_preset_<tier>` can inherit another preset's audio and advanced-video stack. The installed values are conservative VMAF-aligned starting points for comparable perceptual quality, but exact results still depend on codec generation, driver, source content, and hardware. Multipass accepts `0` (none), `1` (quarter resolution), or `2` (full resolution), and `multipass_<tier>` overrides it for one output tier. Streaming uses `0` at 4K and `1` at 1080p and below. `b_ref_mode` accepts `disabled`, `each`, or `middle`. `rc_lookahead` accepts `0` through `42`, and `spatial_aq` accepts `0` through `15`; zero disables either feature.

Changing a built-in value in the app switches the working selection to Custom and immediately reveals the preset-name field. Enter a name and choose **Save** to create or update that section in `custom_preset.ini`. Its description is the same as its section name. If `custom_preset.ini` does not exist in the platform application-data directory, the app exposes no saved custom presets.

Open the gear menu and choose **View Change Log** to read the installed version's GitHub release notes inside the app.

### Application updates

Windows x64 builds check the public Squirrel feed at startup and every 15 minutes in the background. When startup detects a new version, all other initialization remains paused on the splash screen through the download and until the update prompt is visible and answered. **Restart and update** installs immediately after cleanly cancelling active work. **Later** continues loading the app and installs the downloaded update when the app exits. **Versions 0.3.0 and 0.3.1 use the repository's former URL and must be upgraded manually once.** Windows ARM64 and unsigned macOS builds should download new releases manually; Linux updates are provided through the installed package manager.

Every packaged Windows startup and update installation recursively removes obsolete `app-<version>` directories and retries locked remnants up to ten times. Only the running version is preserved, including when an older directory contains nothing except `resources/app.asar`. Logs archived by an earlier version are deleted, and the active runtime log is reset when its recorded application version differs from the current release.

Auto Scale chooses an output profile from the source resolution. Selecting a scale explicitly applies that output profile's dimensions, bitrate limits, and buffer to the active built-in preset. When auto-crop removes black bars, the app derives an even output height from the cropped display aspect ratio before sending the dimensions to CUDA, QSV, AMF, VA-API, VideoToolbox, or a CPU encoder. On NVIDIA, a matching CUVID decoder crops in-place without leaving GPU memory. If decoder-side crop is unavailable, generic NVDEC uses the protected download, CPU crop, and CUDA upload bridge before CUDA scaling, optional tone mapping, and NVENC output. A genuine hardware-decode failure still retries once with software decoding and the selected NVENC encoder.

| Output profile | FFmpeg scale | Streaming codec | Maximum video rate | Streaming NVENC quality |
| --- | --- | --- | --- | --- |
| 4K | `2720:-2` | HEVC Main / Main10 | 8000 kbps | CQ 31 |
| 1080p | `1760:-2` | HEVC Main / Main10 | 5000 kbps | CQ 31 |
| 720p | `1320:-2` | AV1 | 2500 kbps | CQ 32 |
| 360p | `720:-2` | AV1 | 2500 kbps | CQ 32 |

Streaming selects HEVC Main for SDR output at 4K and 1080p, and defaults to HEVC Main10 for HEVC Main10, HDR, or Dolby Vision sources when the selected encoder passed its 10-bit capability test. Auto Scale and explicit scaling switch Streaming to AV1 at 720p and 360p. H.264 exposes a Filters-tab High-profile toggle that defaults on whenever H.264 is selected. Archive and Regular select H.264 by default. At 1080p, the H.264 maximum rates are 10000 kbps for Archive, 8000 kbps for Regular, 6500 kbps for Streaming, and 7000 kbps for Music Video. At 720p and 360p/Cellular, the H.264 maximum rate is 4000 kbps. Regular and Streaming use P4 for H.264 at 4K and 1080p, Music Video uses P6, and all three use P2 at 720p and 360p; Archive retains P6.

Streaming and Cellular retain `video_bitrate=0`, so their capped quality-based VBR encoders can reduce bitrate on easy scenes instead of targeting a fixed average. Their frame-rate override defaults on when a source exceeds the configured 23.976 fps target and can be switched off for passthrough without retiming the audio; encoded audio retains timestamp-aware asynchronous resampling for gap and overlap protection.

## System requirements

The operating-system floor was reviewed on August 18, 2026. Use a release that still receives vendor security updates:

| Operating system | Minimum supported release | Architecture |
| --- | --- | --- |
| Windows | Windows 11 24H2 | x64 or ARM64 |
| macOS | macOS Sonoma 14 | Intel x64 or Apple silicon ARM64 |
| Debian | Debian 12 Bookworm LTS | amd64 or arm64 |
| Ubuntu | Ubuntu 24.04 LTS | amd64 or arm64 |

Windows 11 24H2 Home and Pro receive updates through October 13, 2026, so upgrade to a newer serviced Windows release before that date. Microsoft publishes current dates on the [Windows 11 lifecycle page](https://learn.microsoft.com/en-us/lifecycle/products/windows-11-home-and-pro). Apple was still publishing Sonoma 14 security updates when this requirement was reviewed; see [Apple security releases](https://support.apple.com/100100). Debian 12 LTS is supported through June 30, 2028 according to the [Debian LTS announcement](https://www.debian.org/News/2026/20260712), and Ubuntu 24.04 LTS receives standard security maintenance through May 2029 according to the [Ubuntu release cycle](https://ubuntu.com/about/release-cycle).

ARM64 describes the application and Jellyfin FFmpeg runtime architecture, not guaranteed GPU support. If no supported accelerator is available, disable **Hardware Acceleration** to use CPU video encoding and decoding. Apple silicon can use VideoToolbox when detected.

Also required:

- A supported GPU connected to the primary physical display.
- The latest production graphics driver from NVIDIA, Intel, AMD, or Apple.
- Permission to use the GPU device. Linux QSV and VA-API require an accessible `/dev/dri/renderD128` device and the appropriate vendor media driver.
- Free storage for the source, completed output, temporary preview, and partial output file.
- Internet access for initial managed-runtime downloads and later runtime/update checks.

## Hardware encoder support

Jellyfin FFmpeg exposes the hardware interfaces used by EA Media Tools: NVIDIA NVENC/NVDEC and CUDA, Intel Quick Sync Video, AMD AMF, Linux VA-API, and Apple VideoToolbox. See Jellyfin's [hardware acceleration overview](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/) for the upstream platform mapping.

| GPU | EA Media Tools backend | H.264 output | HEVC output | AV1 output |
| --- | --- | --- | --- | --- |
| NVIDIA | NVENC on Windows/Linux; CUDA and NVDEC when detected | `h264_nvenc` | `hevc_nvenc` | `av1_nvenc` |
| Intel | QSV on Windows/Linux; VA-API may also be used on Linux | `h264_qsv` / `h264_vaapi` | `hevc_qsv` / `hevc_vaapi` | `av1_qsv` / `av1_vaapi` |
| AMD | AMF on Windows; VA-API on Linux | `h264_amf` / `h264_vaapi` | `hevc_amf` / `hevc_vaapi` | `av1_amf` / `av1_vaapi` |
| Apple | VideoToolbox on macOS | `h264_videotoolbox` | `hevc_videotoolbox` | `av1_videotoolbox` when exposed by the hardware/runtime |

### NVIDIA

- H.264: an NVIDIA GPU with NVENC; Maxwell or newer is the practical baseline.
- HEVC 8-bit: second-generation Maxwell GM206 or newer.
- HEVC Main 10: Pascal or newer.
- AV1: Ada Lovelace, including GeForce RTX 40-series, or newer.
- Some low-end/mobile models have no NVENC even when their generation normally supports it. The app's startup test is authoritative.

See Jellyfin's [NVIDIA codec-generation guide](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/nvidia/) and NVIDIA's [Video Codec SDK](https://developer.nvidia.com/video-codec-sdk).

### Intel

- H.264: any Intel GPU that provides Quick Sync Video.
- HEVC 8-bit: Skylake/6th-generation Core or newer.
- HEVC Main 10: Kaby Lake/7th-generation Core, Apollo Lake, Gemini Lake, or newer.
- AV1: Intel Arc A-series, Meteor Lake/Core Ultra, or newer hardware with AV1 encoding.
- Intel processors with an `F` suffix normally have no integrated GPU; they require another supported GPU.

See Jellyfin's [Intel codec-generation guide](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/intel/) and the official [Intel media-driver capability table](https://github.com/intel/media-driver).

### AMD

- H.264: an AMD GPU that exposes AMF on Windows or VA-API on Linux; GCN or newer is the general baseline.
- HEVC 8-bit: Radeon RX 400/500 Polaris or newer.
- HEVC Main 10: Radeon RX 5000, Ryzen 4000 APU, or newer.
- AV1: Radeon RX 7000/RDNA 3, supported Ryzen 7000/8000-family APUs, or newer.
- Radeon RX 6400 and RX 6500 models do not include a video encoder.

See Jellyfin's [AMD codec-generation guide](https://jellyfin.org/docs/general/post-install/transcoding/hardware-acceleration/amd/) and AMD's [AMF hardware capability table](https://github.com/GPUOpen-LibrariesAndSDKs/AMF/wiki/GPU-and-APU-HW-Features-and-Support).

Codec generation is not a guarantee: laptop variants, disabled iGPUs, missing firmware, driver versions, Linux media packages, and manufacturer-specific GPU configurations can change what is available. EA Media Tools only enables flags that pass its runtime hardware test.

## Development

Development and release builds require Node.js 24. Use the version declared in `.nvmrc`, then install and verify the project:

```bash
nvm use
npm ci
npm run check
npm run typecheck:compat
```

## Licensing

EA Media Tools source code is available under the [MIT License](LICENSE).
Downloaded Jellyfin FFmpeg, rsgain, and CCExtractor binaries remain under their upstream licenses and
are not relicensed by this project. See [Third-party software notices](THIRD_PARTY_NOTICES.md)
for source-code and license information.

Development of this project includes generative AI assistance. See the
[AI Assistance Disclosure](AI_DISCLOSURE.md) for its scope and limitations.
