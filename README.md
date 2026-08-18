# EA Media Tools

EA Media Tools is a desktop video converter powered by Jellyfin FFmpeg. It inspects video, audio, subtitle, chapter, HDR, and Dolby Vision metadata; selects a supported hardware encoder; and runs queued conversions with live progress information.

Version 0.2.0 is a prerelease. Only video input is supported, and a compatible hardware video encoder is required. There is no software-encoding fallback.

## Download

Download the newest build from the [GitHub Releases page](https://github.com/eaforlife/EA-Media-Tools/releases). Prereleases are marked **Pre-release**.

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

The prerelease installer is not digitally signed. Remove the app later from **Settings > Apps > Installed apps > EA Media Tools**. The uninstaller also clears the app-managed settings, runtime, cache, cookies, logs, and previews.

### macOS

1. Download the ZIP for `darwin-arm64` on Apple silicon or `darwin-x64` on an Intel Mac.
2. Extract the ZIP and move **EA Media Tools.app** into **Applications**.
3. On first launch, Control-click the app, select **Open**, and confirm the prompt if Gatekeeper blocks the unsigned prerelease.

The macOS prerelease is not signed or notarized. To uninstall it, quit the app and move it from **Applications** to the Trash.

### Debian and Ubuntu

Install the downloaded package from a terminal. Replace the filename with the asset you downloaded:

```bash
sudo apt install ./ea-media-tools_0.2.0_amd64.deb
```

ARM64 systems use the package ending in `arm64.deb`. Launch **EA Media Tools** from the desktop application menu. Remove it with:

```bash
sudo apt remove ea-media-tools
```

## First launch

An internet connection is required the first time the packaged app runs. EA Media Tools downloads the latest matching x64 or ARM64 portable runtime from the official [Jellyfin FFmpeg releases](https://github.com/jellyfin/jellyfin-ffmpeg/releases), verifies the published SHA-256 digest when available, and installs `ffmpeg` and `ffprobe` in app-managed storage.

The app then checks the GPU driving the primary physical display. Virtual and secondary display adapters are ignored and recorded in **View Logs**. An encoder appears only after the corresponding Jellyfin FFmpeg flag completes an actual test encode on the installed hardware.

## System requirements

The operating-system floor was reviewed on August 18, 2026. Use a release that still receives vendor security updates:

| Operating system | Minimum supported release | Architecture |
| --- | --- | --- |
| Windows | Windows 11 24H2 | x64 or ARM64 |
| macOS | macOS Sonoma 14 | Intel x64 or Apple silicon ARM64 |
| Debian | Debian 12 Bookworm LTS | amd64 or arm64 |
| Ubuntu | Ubuntu 24.04 LTS | amd64 or arm64 |

Windows 11 24H2 Home and Pro receive updates through October 13, 2026, so upgrade to a newer serviced Windows release before that date. Microsoft publishes current dates on the [Windows 11 lifecycle page](https://learn.microsoft.com/en-us/lifecycle/products/windows-11-home-and-pro). Apple was still publishing Sonoma 14 security updates when this requirement was reviewed; see [Apple security releases](https://support.apple.com/100100). Debian 12 LTS is supported through June 30, 2028 according to the [Debian LTS announcement](https://www.debian.org/News/2026/20260712), and Ubuntu 24.04 LTS receives standard security maintenance through May 2029 according to the [Ubuntu release cycle](https://ubuntu.com/about/release-cycle).

ARM64 describes the application and Jellyfin FFmpeg runtime architecture, not guaranteed GPU support. Qualcomm/Adreno on Windows and Mali/Rockchip on Linux are not supported in 0.2.0; those systems can encode only if one of the NVIDIA, Intel, or AMD backends below passes detection. Apple silicon uses VideoToolbox and is supported on macOS.

Also required:

- A supported GPU connected to the primary physical display.
- The latest production graphics driver from NVIDIA, Intel, AMD, or Apple.
- Permission to use the GPU device. Linux QSV and VA-API require an accessible `/dev/dri/renderD128` device and the appropriate vendor media driver.
- Free storage for the source, completed output, temporary preview, and partial output file.
- Internet access for the initial Jellyfin FFmpeg runtime download and later runtime/update checks.

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

## Licensing

EA Media Tools source code is available under the [MIT License](LICENSE).
Downloaded Jellyfin FFmpeg binaries remain under their upstream licenses and
are not relicensed by this project. See [Third-party software notices](THIRD_PARTY_NOTICES.md)
for source-code and license information.

Development of this project includes generative AI assistance. See the
[AI Assistance Disclosure](AI_DISCLOSURE.md) for its scope and limitations.
