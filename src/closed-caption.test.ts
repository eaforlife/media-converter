import assert from 'node:assert/strict';
import test from 'node:test';
import { ccextractorArguments, injectClosedCaptionInput } from './closed-caption.ts';

test('builds a CCExtractor SRT command without a shell', () => {
  assert.deepEqual(ccextractorArguments('C:\\input\\episode.mkv', 'C:\\temp\\captions.srt'), [
    'C:\\input\\episode.mkv', '--out=srt', '-o', 'C:\\temp\\captions.srt',
  ]);
});

test('adds extracted captions as a second FFmpeg input and next subtitle stream', () => {
  const args = [
    '-i', 'C:\\input\\episode.mkv',
    '-map', '0:v:0', '-map', '0:2', '-c:s:0', 'subrip',
    'C:\\output\\episode.mkv',
  ];
  const injected = injectClosedCaptionInput(
    args, 'C:\\input\\episode.mkv', 'C:\\temp\\captions.srt', 'subrip',
  );
  assert.deepEqual(injected.slice(0, 4), [
    '-i', 'C:\\input\\episode.mkv', '-i', 'C:\\temp\\captions.srt',
  ]);
  assert.ok(injected.includes('-c:s:1'));
  assert.deepEqual(injected.slice(-2), ['hearing_impaired', 'C:\\output\\episode.mkv']);
});
