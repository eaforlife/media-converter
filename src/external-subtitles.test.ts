import assert from 'node:assert/strict';
import test from 'node:test';
import {
  externalSubtitleInputArguments, externalSubtitleTracks, importedSubtitleTracks, isUtf8SubtitleData,
  subtitleInputSpecifier,
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
    language: 'eng',
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

test('matches an exact basename without language or flags and supports UTF-8 text subtitle formats', () => {
  const tracks = externalSubtitleTracks('/shows/Season 01/Show A.mkv', [
    '/shows/Season 01/Show A.srt',
    '/shows/Season 01/Show A.ja.forced.ass',
    '/shows/Season 01/Show A.en.sdh.vtt',
    '/shows/Season 02/Show A.en.srt',
  ], 1);
  assert.equal(tracks.length, 3);
  assert.deepEqual(tracks[0].flags, { default: false, forced: false, hearingImpaired: false });
  assert.equal(tracks[0].language, 'und');
  assert.equal(tracks[1].language, 'jpn');
  assert.equal(tracks[1].codec, 'ass');
  assert.equal(tracks[2].codec, 'webvtt');
});

test('manual imports accept unmatched names as undefined and reject malformed UTF-8 data', () => {
  const tracks = importedSubtitleTracks('/shows/Show A.mkv', ['/downloads/Captions.ssa'], 7);
  assert.equal(tracks[0].language, 'und');
  assert.deepEqual(tracks[0].flags, { default: false, forced: false, hearingImpaired: false });
  assert.equal(isUtf8SubtitleData(new TextEncoder().encode('1\n00:00:00,000 --> 00:00:01,000\nHello')), true);
  assert.equal(isUtf8SubtitleData(Uint8Array.from([0xc3, 0x28])), false);
  assert.equal(isUtf8SubtitleData(new Uint8Array()), false);
});
