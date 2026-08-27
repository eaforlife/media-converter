import assert from 'node:assert/strict';
import test from 'node:test';
import {
  externalSubtitleInputArguments, externalSubtitleTracks, subtitleInputSpecifier,
} from './external-subtitles.ts';
import type { SubtitleStreamInfo } from './shared-types.ts';

test('matches SRT sidecars and derives language and dispositions from the filename', () => {
  const tracks = externalSubtitleTracks('/shows/Show A H264.mkv', [
    '/shows/Show A H264.en.default.srt',
    '/shows/Show A H264.fr.forced.sdh.srt',
    '/shows/Different Show.en.srt',
    '/shows/Show A H264.commentary.english.srt',
  ], 4);
  assert.equal(tracks.length, 2);
  assert.deepEqual(tracks[0], {
    index: 4,
    codec: 'subrip',
    codecLabel: 'External SubRip (SRT)',
    language: 'en',
    languageLabel: 'English',
    kind: 'text',
    isUtf8: true,
    flags: { default: true, forced: false, hearingImpaired: false },
    externalPath: '/shows/Show A H264.en.default.srt',
  });
  assert.deepEqual(tracks[1].flags, { default: false, forced: true, hearingImpaired: true });
});

test('adds external files as FFmpeg inputs and maps them after the primary media input', () => {
  const embedded = { index: 3 } as SubtitleStreamInfo;
  const external = externalSubtitleTracks('/shows/Show.mkv', ['/shows/Show.en.srt'], 4)[0];
  const tracks = [embedded, external];
  assert.deepEqual(externalSubtitleInputArguments(tracks), ['-i', '/shows/Show.en.srt']);
  assert.equal(subtitleInputSpecifier(embedded, tracks), '0:3');
  assert.equal(subtitleInputSpecifier(external, tracks), '1:0');
});
