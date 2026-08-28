import assert from 'node:assert/strict';
import test from 'node:test';
import { mp4PlaybackArguments } from './mp4-playback.ts';

test('optimizes transcoded HEVC MP4 for seeking and browser playback', () => {
  assert.deepEqual(mp4PlaybackArguments('HEVC'), [
    '-force_key_frames:v:0', 'expr:gte(t,n_forced*5)',
    '-tag:v:0', 'hvc1',
    '-movflags', '+faststart',
  ]);
});

test('keeps codec tags native while adding MP4 seek points for other encoders', () => {
  assert.deepEqual(mp4PlaybackArguments('AV1'), [
    '-force_key_frames:v:0', 'expr:gte(t,n_forced*5)',
    '-movflags', '+faststart',
  ]);
});

test('does not force new keyframes while stream-copying video', () => {
  assert.deepEqual(mp4PlaybackArguments(null), ['-movflags', '+faststart']);
});
