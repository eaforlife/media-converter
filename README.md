# EA Media Tools

EA Media Tools is a desktop video and audio converter powered by Jellyfin FFmpeg. It converts video and audio, processes subtitles and metadata, and can use supported hardware encoders or the CPU.

Version **3.0.0**, codename **leopard**.

## Download

Get the latest installer or package from the [GitHub Releases page](https://github.com/eaforlife/media-converter/releases). Choose the download for your operating system and processor. The `.nupkg` and `RELEASES` files are used by the Windows updater.

## Install

### Windows

Download and run the x64 `Setup.exe`. The installer is unsigned, so Windows SmartScreen may ask you to confirm that you trust the download. Uninstall from **Settings > Apps > Installed apps > EA Media Tools**.

### macOS

Download the `darwin-arm64` ZIP for Apple silicon or `darwin-x64` for Intel. Extract it and move **EA Media Tools.app** into **Applications**. The app is unsigned and not notarized; Control-click it and choose **Open** on first launch if Gatekeeper blocks it.

### Debian and Ubuntu

Install the downloaded `.deb` package, for example:

```bash
sudo apt install ./ea-media-tools_3.0.0_amd64.deb
```

Use the package ending in `arm64.deb` on ARM64 systems. Remove the app with `sudo apt remove ea-media-tools`.

## System requirements

- Windows 11 (x64), macOS (Intel or Apple silicon), or Debian/Ubuntu Linux (amd64 or arm64).
- Internet access for first-launch setup and application/runtime update checks.
- A supported GPU is recommended for hardware acceleration. CPU video processing is available when hardware acceleration is disabled.

For first-launch behavior, preset and configuration details, and supported hardware encoders, see the [EA Media Tools technical guide](https://github.com/eaforlife/eajelly#ea-media-tools).

## Development

Development and release builds require Node.js 24. Use the version declared in `.nvmrc`, then install and verify the project:

```bash
nvm use
npm ci
npm run check
npm run typecheck:compat
```

## Licensing

EA Media Tools source code is available under the [MIT License](LICENSE). Downloaded Jellyfin FFmpeg, rsgain, and CCExtractor binaries remain under their upstream licenses. See [Third-party software notices](THIRD_PARTY_NOTICES.md) for details.

Development of this project includes generative AI assistance. See the [AI Assistance Disclosure](AI_DISCLOSURE.md) for its scope and limitations.
