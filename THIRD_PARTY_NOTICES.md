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

## rsgain

EA Media Tools downloads and verifies the separately maintained rsgain 3.7
command-line runtime for planned ReplayGain support. rsgain is licensed under
the BSD 2-Clause License and is not covered by the EA Media Tools MIT License.

- Project, source, and releases: https://github.com/complexlogic/rsgain
- Release used by this application: https://github.com/complexlogic/rsgain/releases/tag/v3.7
- License: https://github.com/complexlogic/rsgain/blob/v3.7/LICENSE

The selected upstream archive is extracted under `lib/rsgain`; its published
SHA-256 digest is verified when supplied by GitHub.

## CCExtractor

EA Media Tools can download and invoke CCExtractor to convert embedded
CEA-608/708 closed captions into SubRip text before FFmpeg remuxes that text
into a converted video. CCExtractor is licensed under GNU GPL version 2.0 and
is not covered by the EA Media Tools MIT License.

- Project and source: https://github.com/CCExtractor/ccextractor
- Releases: https://github.com/CCExtractor/ccextractor/releases
- License: https://github.com/CCExtractor/ccextractor/blob/master/LICENSE.txt

Compatible official release archives are extracted under `lib/ccextractor`;
their published SHA-256 digest is verified when supplied by GitHub. Platforms
without a compatible portable release keep caption extraction disabled.

## Other dependencies

The application also uses third-party npm packages. Their license information
is available in their respective package metadata and source repositories.
