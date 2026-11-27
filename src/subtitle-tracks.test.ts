import assert from 'node:assert/strict';
import test from 'node:test';
import { matchMetadataTrack, matchingTrackIndex, subtitleStreamFlags, subtitleTracksInSourceOrder } from './subtitle-tracks.ts';

const flags = (defaultFlag = false, forced = false, hearingImpaired = false) => ({
  default: defaultFlag,
  forced,
  hearingImpaired,
});

test('detects SDH and hearing-impaired labels from subtitle descriptions and titles', () => {
  assert.equal(subtitleStreamFlags(flags(), { description: 'English (SDH)' }).hearingImpaired, true);
  assert.equal(subtitleStreamFlags(flags(), { TITLE: '[Hearing Impaired]' }).hearingImpaired, true);
  assert.equal(subtitleStreamFlags(flags(true, false, true), { description: 'English' }).hearingImpaired, true);
  assert.equal(subtitleStreamFlags(flags(), { description: 'English dialogue' }).hearingImpaired, false);
  assert.equal(subtitleStreamFlags(flags(), { description: 'English washed colors' }).hearingImpaired, false);
});

test('batch metadata matching follows source flags when duplicate language tracks are reordered', () => {
  const source = [
    { index: 3, language: 'eng', flags: flags(true, true) },
    { index: 5, language: 'eng', flags: flags() },
    { index: 8, language: 'eng', flags: flags(false, false, true) },
  ];
  const target = [
    { index: 2, language: 'eng', flags: flags(false, false, true) },
    { index: 4, language: 'eng', flags: flags(true, true) },
    { index: 6, language: 'eng', flags: flags() },
  ];
  assert.equal(matchingTrackIndex(source, target, 2), 8);
  assert.equal(matchingTrackIndex(source, target, 4), 3);
  assert.equal(matchingTrackIndex(source, target, 6), 5);

  const edited = { language: 'jpn', flags: flags(false, true, false) };
  assert.equal(matchMetadataTrack(source[2], edited, target, 0), target[0]);
});

test('subtitle output selection filters without changing source order or adding tracks', () => {
  const sourceOrder = [
    { index: 10, kind: 'text' as const },
    { index: 4, kind: 'text' as const },
    { index: 7, kind: 'image' as const },
    { index: 12, kind: 'text' as const },
  ];
  const settings = {
    10: { enabled: true },
    4: { enabled: true },
    7: { enabled: true },
    12: { enabled: false },
  };
  const output = subtitleTracksInSourceOrder(sourceOrder, settings, (track) => track.kind === 'text');
  assert.deepEqual(output.map((track) => track.index), [10, 4]);
  assert.deepEqual(subtitleTracksInSourceOrder(sourceOrder, settings).map((track) => track.index), [10, 4, 7]);
});
