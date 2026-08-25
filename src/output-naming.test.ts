import { equal } from 'node:assert/strict';
import { test } from 'node:test';
import { preservedOutputBaseName } from './output-naming.ts';

test('audio and music-video outputs preserve the source filename stem', () => {
  equal(preservedOutputBaseName('Artist - Song.flac'), 'Artist - Song');
  equal(preservedOutputBaseName('Artist - Song [Official Video].mkv'), 'Artist - Song [Official Video]');
});
