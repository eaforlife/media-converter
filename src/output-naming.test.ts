import { equal } from 'node:assert/strict';
import { test } from 'node:test';
import { commonSeriesFolderName, parseEpisodeIdentity, preservedOutputBaseName, smartSeriesBaseName } from './output-naming.ts';

test('audio and music-video outputs preserve the source filename stem', () => {
  equal(preservedOutputBaseName('Artist - Song.flac'), 'Artist - Song');
  equal(preservedOutputBaseName('Artist - Song [Official Video].mkv'), 'Artist - Song [Official Video]');
});

test('smart video naming removes release details and preserves episode identity', () => {
  const source = 'A.Bona.fide.Killer.2026.S01E07.1080p.KCW.WEB-DL.AAC2.0.H.264-DUSKLiGHT.mkv';
  equal(smartSeriesBaseName(source), 'A Bona fide Killer S01E07');
  equal(parseEpisodeIdentity(source)?.year, 2026);
  equal(commonSeriesFolderName([source]), 'A Bona fide Killer (2026)');
});

test('folder naming supports multiple seasons of the same show', () => {
  equal(commonSeriesFolderName([
    'Example.Show.2026.S01E01.mkv',
    'Example.Show.2026.S02E01.mkv',
  ]), 'Example Show (2026)');
  equal(commonSeriesFolderName(['Example.Show.S01E01.mkv', 'Different.Show.S01E02.mkv']), null);
});
