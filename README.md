# EA Media Tools

A modern Electron desktop interface for building and running FFmpeg media
conversion workflows.

## Development

```powershell
npm.cmd install
npm.cmd start
```

Development mode checks for local `lib/ffmpeg.exe` and `lib/ffprobe.exe` files
but does not download or update FFmpeg. Packaged builds can download a matching
portable runtime directly from the latest Jellyfin FFmpeg GitHub release.

## Versions and releases

```powershell
npm.cmd run version:patch
npm.cmd run make
npm.cmd run publish
```

GitHub publishing is configured for `eaforlife/EA-Media-Tools` and creates a
draft release. Review and publish that draft to make it available to the
application updater.

## Licensing

EA Media Tools source code is available under the [MIT License](LICENSE).
Downloaded Jellyfin FFmpeg binaries remain under their upstream licenses and
are not relicensed by this project. See [Third-party software notices](THIRD_PARTY_NOTICES.md)
for source-code and license information.
