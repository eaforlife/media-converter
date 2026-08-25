# EA Media Tools

EA Media Tools is a desktop video converter powered by Jellyfin FFmpeg. It inspects video, audio, subtitle, chapter, HDR, and Dolby Vision metadata; selects a supported hardware encoder; and runs queued conversions with live progress information.

Version 1.1.0, codename **ea-video**, is the current stable release. Only video input is supported. A compatible hardware video encoder is required when processing video; metadata-only stream-copy updates do not re-encode the source.

## Download

Download the newest build from the [GitHub Releases page](https://github.com/eaforlife/media-converter/releases).

Choose the asset that matches your operating system and CPU:

| System | Intel/AMD 64-bit | ARM 64-bit |
| --- | --- | --- |
| Windows | `EA-Media-Tools-x64-Setup.exe` | `EA-Media-Tools-arm64-Setup.exe` |
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
sudo apt install ./ea-media-tools_1.1.0_amd64.deb
```

ARM64 systems use the package ending in `arm64.deb`. Launch **EA Media Tools** from the desktop application menu. Remove it with:

```bash
sudo apt remove ea-media-tools
```

## First launch

An internet connection is required the first time the packaged app runs. Before other initialization, the splash screen waits for the application update check to finish. EA Media Tools then downloads and verifies both the latest stable and latest prerelease portable builds from the official [Jellyfin FFmpeg releases](https://github.com/jellyfin/jellyfin-ffmpeg/releases). They are installed separately under `lib/ffmpeg-stable` and `lib/ffmpeg-unstable`; the welcome-page gear menu has a persisted **Stable** switch that selects the active runtime. The status bar shows the selected channel and Jellyfin release version with a green stable or yellow prerelease indicator.

The managed runtime setup also installs [rsgain 3.7](https://github.com/complexlogic/rsgain/releases/tag/v3.7) under `lib/rsgain` for future audio-gain support. On platforms with a compatible official portable build, [CCExtractor](https://github.com/CCExtractor/ccextractor/releases) is installed under `lib/ccextractor`. The Subtitles tab can opt into extracting embedded CEA-608/708 closed captions to a temporary SRT before FFmpeg remuxes it into the output. Temporary caption files are removed after success, failure, cancellation, and update restart.

The app then checks the GPU driving the primary physical display. Virtual and secondary display adapters are ignored and recorded in **View Logs**. An encoder appears only after the corresponding Jellyfin FFmpeg flag completes an actual test encode on the installed hardware.

Folder analysis inspects up to two videos at a time. NVENC-only batches encode up to two files simultaneously; each available encode slot waits 10 seconds before starting its next file. Batches using another hardware encoder remain serial.

The encode window keeps a separate progress page for every queued video. Browse pages with **Previous** and **Next** to inspect pending, active, completed, cancelled, or failed jobs. **Live FFmpeg Output** opens one console-style session log containing every command as its encode starts; executable and media paths are displayed as `ffmpeg`, `<input>`, and `<output>`. **Start New** becomes available after the queue settles. **Done** appears only after every job has completed or cancelled, then waits for active workers and partial-output cleanup before closing the app.

Video, audio, and subtitle tabs each have a processing checkbox. Checked sections use their configured encoder settings; unchecked sections copy every source stream without re-encoding. Uncheck all three sections to enter metadata-only mode, where stream languages and default, forced, and hearing-impaired dispositions can be edited. Batch metadata changes stay local to each selected source. The app creates a same-directory `_tmp00` (or queue-indexed) stream copy, installs it only after FFmpeg succeeds, and restores the original if replacement cannot complete.

Open the gear menu and choose **View Change Log** to read the installed version's GitHub release notes inside the app.

### Application updates

Windows x64 builds check the public Squirrel feed at startup and every 15 minutes in the background. The loading screen remains visible until the startup check resolves. When a downloaded update is ready, choosing **Restart and update** cleanly cancels active encodes and removes partial outputs before installation. **Versions 0.3.0 and 0.3.1 use the repository's former URL and must be upgraded manually once.** Windows ARM64 and unsigned macOS builds should download new releases manually; Linux updates are provided through the installed package manager.

Auto Scale chooses an output profile from the source resolution. Selecting a scale explicitly applies that output profile's dimensions, bitrate limits, buffer, and NVENC settings to the active built-in preset:

| Output profile | FFmpeg scale | Maximum video rate | Streaming quality |
| --- | --- | --- | --- |
| 4K | `2720:-2` | 9500 kbps | CQ 29 |
| 1080p | `1760:-2` | 7000 kbps | CQ 28 |
| 720p | `1320:-2` | 2500 kbps | CQ 29 |
| 360p / Cellular | `720:-2` | 2500 kbps | CQ 32 |

## System requirements

The operating-system floor was reviewed on August 18, 2026. Use a release that still receives vendor security updates:

| Operating system | Minimum supported release | Architecture |
| --- | --- | --- |
| Windows | Windows 11 24H2 | x64 or ARM64 |
| macOS | macOS Sonoma 14 | Intel x64 or Apple silicon ARM64 |
| Debian | Debian 12 Bookworm LTS | amd64 or arm64 |
| Ubuntu | Ubuntu 24.04 LTS | amd64 or arm64 |

Windows 11 24H2 Home and Pro receive updates through October 13, 2026, so upgrade to a newer serviced Windows release before that date. Microsoft publishes current dates on the [Windows 11 lifecycle page](https://learn.microsoft.com/en-us/lifecycle/products/windows-11-home-and-pro). Apple was still publishing Sonoma 14 security updates when this requirement was reviewed; see [Apple security releases](https://support.apple.com/100100). Debian 12 LTS is supported through June 30, 2028 according to the [Debian LTS announcement](https://www.debian.org/News/2026/20260712), and Ubuntu 24.04 LTS receives standard security maintenance through May 2029 according to the [Ubuntu release cycle](https://ubuntu.com/about/release-cycle).

ARM64 describes the application and Jellyfin FFmpeg runtime architecture, not guaranteed GPU support. Qualcomm/Adreno on Windows and Mali/Rockchip on Linux are not supported for video encoding in 1.1.0; those systems can encode video only if one of the NVIDIA, Intel, or AMD backends below passes detection. Apple silicon uses VideoToolbox and is supported on macOS.

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
