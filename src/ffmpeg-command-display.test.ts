import assert from 'node:assert/strict';
import test from 'node:test';
import { formatSessionFfmpegCommand } from './ffmpeg-command-display.ts';

test('redacts the executable, input, and output paths in session commands', () => {
  const command = [
    'C:\\Users\\Public\\ffmpeg.exe',
    '-hide_banner',
    '-i',
    'C:\\Media Files\\Episode 1.mkv',
    '-c:v',
    'hevc_nvenc',
    'C:\\Output\\.Episode 1.ea-part.mp4',
  ];
  assert.equal(
    formatSessionFfmpegCommand(command),
    'ffmpeg -hide_banner -i <input> -c:v hevc_nvenc <output>',
  );
  assert.equal(command[0], 'C:\\Users\\Public\\ffmpeg.exe');
});

test('redacts every ffmpeg input while retaining non-path arguments', () => {
  assert.equal(
    formatSessionFfmpegCommand([
      '/opt/ffmpeg/bin/ffmpeg', '-i', '/media/video.mkv', '-i', '/media/audio track.flac',
      '-filter_complex', '[0:v]scale=1760:-2[v]', '-map', '[v]', '/tmp/output.mp4',
    ]),
    'ffmpeg -i <input> -i <input> -filter_complex "[0:v]scale=1760:-2[v]" -map "[v]" <output>',
  );
});

test('shows rsgain-only work while redacting the library path', () => {
  assert.equal(
    formatSessionFfmpegCommand([
      'C:\\Tools\\rsgain.exe', 'easy', '-m', 'MAX', '-S', 'C:\\Music Library',
    ]),
    'rsgain easy -m MAX -S <library>',
  );
});
