# Third-party software notices

EA Media Tools is licensed under the MIT License. Its license does not replace
or alter the licenses of third-party programs used with it.

## Jellyfin FFmpeg

EA Media Tools can download and invoke the separately maintained Jellyfin
FFmpeg command-line programs (`ffmpeg` and `ffprobe`). Jellyfin FFmpeg is not
part of EA Media Tools and is not covered by the EA Media Tools MIT License.
No endorsement by the Jellyfin or FFmpeg projects is implied.

- Project: Jellyfin FFmpeg
- Copyright: the FFmpeg and Jellyfin FFmpeg contributors
- Upstream project and source: https://github.com/jellyfin/jellyfin-ffmpeg
- Releases: https://github.com/jellyfin/jellyfin-ffmpeg/releases
- Upstream licensing information:
  https://github.com/jellyfin/jellyfin-ffmpeg/blob/jellyfin/LICENSE.md

The portable assets selected by EA Media Tools are identified upstream as GPL
builds. FFmpeg's upstream licensing information states that GPL-enabled builds
are licensed under the GNU General Public License version 2 or later, and that
some build configurations or included libraries can require version 3. The
license files downloaded beside each runtime are authoritative for that copy.

For every managed runtime, EA Media Tools places the upstream `LICENSE.md`,
`COPYING.GPLv2`, and `COPYING.GPLv3` files in the same `lib` directory. It also
records the exact release tag and asset name and provides a link to the
corresponding tagged source and build scripts. Users may inspect, replace, or
remove the runtime files without modifying EA Media Tools.

EA Media Tools release artifacts must not bundle FFmpeg binaries unless the
person publishing those artifacts independently confirms and fulfills all
applicable source-code, license, notice, and other obligations. The default
packaging configuration excludes the project-root `lib` directory.

## Other dependencies

The application also uses third-party npm packages. Their license information
is available in their respective package metadata and source repositories.
