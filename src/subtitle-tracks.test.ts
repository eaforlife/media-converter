import assert from 'node:assert/strict';
import test from 'node:test';
import { applyMatchedSubtitleFlag, matchMetadataTrack, matchSubtitleMetadataTrack, matchingTrackIndex, matchingSubtitleTrackIndex, subtitleStreamFlags, subtitleTracksInSourceOrder } from './subtitle-tracks.ts';

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

test('batch metadata matching follows language and SDH identity when duplicate tracks are reordered', () => {
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

test('batch subtitle matching never substitutes a different language or SDH variant', () => {
  const source = [
    { index: 0, language: 'eng', flags: flags(true, false, false) },
    { index: 1, language: 'eng', flags: flags(false, false, true) },
  ];
  const reorderedTarget = [
    { index: 8, language: 'eng', flags: flags(false, false, true) },
    { index: 9, language: 'eng', flags: flags(true, false, false) },
  ];
  assert.equal(matchingTrackIndex(source, reorderedTarget, 8, true), 1);
  assert.equal(matchingTrackIndex(source, reorderedTarget, 9, true), 0);
  assert.equal(matchingTrackIndex(source, [
    { index: 8, language: 'eng', flags: flags(true, false, true) },
  ], 8, true), 1);

  const missingVariant = [
    { index: 10, language: 'eng', flags: flags(false, false, false) },
  ];
  assert.equal(matchSubtitleMetadataTrack(source[1], missingVariant), undefined);
});

test('subtitle matching also preserves text versus image track identity', () => {
  const source = { index: 1, language: 'eng', kind: 'text' as const, flags: flags(false, false, true) };
  const candidates = [
    { index: 8, language: 'eng', kind: 'image' as const, flags: flags(false, false, true) },
    { index: 9, language: 'eng', kind: 'text' as const, flags: flags(true, false, true) },
  ];
  assert.equal(matchSubtitleMetadataTrack(source, candidates)?.index, 9);
});

test('batch subtitle identity uses language and SDH even when default and forced flags differ', () => {
  const origin = [
    { index: 0, language: 'eng', flags: flags(true, false, false) },
    { index: 1, language: 'eng', flags: flags(false, false, true) },
  ];
  const target = [
    { index: 4, language: 'eng', flags: flags(false, true, true) },
    { index: 5, language: 'eng', flags: flags(true, true, false) },
  ];
  assert.equal(matchingTrackIndex(origin, target, 4, true), 1);
  assert.equal(matchingTrackIndex(origin, target, 5, true), 0);
  assert.equal(matchSubtitleMetadataTrack(origin[1], [
    { index: 8, language: 'spa', flags: flags(false, false, true) },
    { index: 9, language: 'eng', flags: flags(true, false, false) },
    { index: 10, language: 'eng', flags: flags(false, true, true) },
  ])?.index, 10);
});

test('batch subtitle matching keeps Arabic and English tracks aligned across different source ordering', () => {
  const origin = [
    { index: 2, language: 'ara', flags: flags(true) },
    { index: 8, language: 'eng', flags: flags(false, false, false) },
    { index: 9, language: 'eng', flags: flags(false, false, true) },
  ];
  const target = [
    { index: 3, language: 'eng', flags: flags(false, false, false) },
    { index: 5, language: 'ara', flags: flags(false) },
    { index: 7, language: 'eng', flags: flags(false, true, true) },
  ];

  assert.equal(matchingTrackIndex(origin, target, 3, true), 8);
  assert.equal(matchingTrackIndex(origin, target, 5, true), 2);
  assert.equal(matchingTrackIndex(origin, target, 7, true), 9);
});

test('batch disposition updates target the matching language and HI identity and preserve other flags', () => {
  const origin = [
    { index: 1, language: 'dan', kind: 'text' as const, flags: flags(true, false, true) },
    { index: 4, language: 'eng', kind: 'text' as const, flags: flags(false, false, true) },
    { index: 6, language: 'spa', kind: 'text' as const, flags: flags(false, true, false) },
  ];
  const target = [
    { index: 3, language: 'spa', kind: 'text' as const, flags: flags(true, false, false) },
    { index: 8, language: 'eng', kind: 'text' as const, flags: flags(false, true, true) },
    { index: 10, language: 'dan', kind: 'text' as const, flags: flags(false, false, true) },
  ];
  const settings = {
    3: { flags: flags(true, false, false) },
    8: { flags: flags(false, true, true) },
    10: { flags: flags(false, false, true) },
  };

  assert.equal(matchingSubtitleTrackIndex(origin, target, 4), 8);
  assert.equal(applyMatchedSubtitleFlag(origin, target, 4, settings, 'default', true), true);
  assert.deepEqual(settings[3].flags, flags(false, false, false));
  assert.deepEqual(settings[8].flags, flags(true, true, true));
  assert.deepEqual(settings[10].flags, flags(false, false, true));
  assert.equal(applyMatchedSubtitleFlag(origin, [target[0], target[2]], 4, settings, 'default', true), false);
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
