# EA Media Tools

A modern Electron desktop interface for building and running FFmpeg media
conversion workflows.

## Development

```powershell
npm.cmd install
npm.cmd start
```

Development mode runs `jellyffmpeg` and `ffprobe` from the system `PATH` and
does not download or update FFmpeg. Packaged builds download a matching portable
runtime directly from the latest Jellyfin FFmpeg GitHub release.

App preferences, immutable built-in preset definitions, and named custom presets
are stored as XML in the extensionless `config` file under Electron's per-user
application-data directory. The running configuration can be viewed from the
in-app gear menu. It also remembers the most recently used source directory.
Fixed presets store buffer multipliers, while saved custom presets store their
explicit buffer size. Source
previews are temporary JPEG files and are removed when the source is replaced,
the workspace is closed, or the application exits.

Runtime checks, downloads, source inspection, and vendor-filtered concurrent GPU capability tests are
timestamped in `app.log` in the same application-data directory. The log is
viewable from the in-app gear menu and rotates to one backup at 5 MB.
Application updates archive an existing log as `app_old<datetime>.log` and start
a fresh version-specific log. Primary physical display detection and ignored
virtual display adapters are included in the hardware diagnostics.

On supported Jellyfin FFmpeg builds, NVIDIA conversion uses native CUVID crop,
`scale_cuda`, and `tonemap_cuda`. Intel uses QSV VPP for hardware scaling and
tone mapping; AMD uses AMF VPP scaling with a software tone-map fallback because
the bundled runtime does not expose an AMF-native tone-map filter.

## Versions and releases

```powershell
npm.cmd run version:patch
npm.cmd run make
npm.cmd run publish
```

GitHub publishing is configured for `eaforlife/EA-Media-Tools` and creates a
draft release. Review and publish that draft to make it available to the
application updater.

### Windows installers

The normal `npm.cmd run make` target produces a Squirrel `.exe` installer. It is
a per-user installation under `%LOCALAPPDATA%`, supports the application updater,
and registers a complete Windows uninstaller. On uninstall, EA Media Tools also
removes its Electron cache, cookies, saved settings, and managed runtime data.

For a machine-wide installation under Program Files with a directory chooser,
install WiX Toolset v3 on the build machine and run:

```powershell
npm.cmd run make:wix
```

This opt-in target produces a traditional MSI with per-machine installation and
a selectable directory. WiX is kept out of the default make target so ordinary
Squirrel builds do not require the external WiX compiler.

### Windows code signing

Public releases should be Authenticode signed. Install the Windows SDK/Visual
Studio SignTool, obtain a code-signing certificate, and set these environment
variables before `make`, `make:wix`, or `publish`:

```powershell
$env:WINDOWS_CERTIFICATE_FILE = 'C:\secure\ea-media-tools.pfx'
$env:WINDOWS_CERTIFICATE_PASSWORD = '<secret>'
```

The Forge configuration signs both the packaged application and generated
Squirrel/WiX installers when both variables are present. Never commit the PFX or
its password to this repository.

## Licensing

EA Media Tools source code is available under the [MIT License](LICENSE).
Downloaded Jellyfin FFmpeg binaries remain under their upstream licenses and
are not relicensed by this project. See [Third-party software notices](THIRD_PARTY_NOTICES.md)
for source-code and license information.

Development of this project includes generative AI assistance. See the
[AI Assistance Disclosure](AI_DISCLOSURE.md) for its scope and limitations.
