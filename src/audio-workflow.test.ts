import assert from 'node:assert/strict';
import test from 'node:test';
import {
  audioBitrate, rsgainArguments, shouldResampleLossless, successfulNormalizationRoots,
} from './audio-workflow.ts';
import type { AudioStreamInfo } from './shared-types.ts';

const track = (overrides: Partial<AudioStreamInfo> = {}): AudioStreamInfo => ({
  index: 0, codec: 'flac', codecLabel: 'FLAC', language: 'und', languageLabel: 'Undefined',
  channels: 2, channelLayout: 'Stereo', isStereo: true, isAtmos: false, isTrueHd: false,
  isDts: false, isDolbyDigitalPlus: false, bitRate: null, sampleRate: 96_000, isLossless: true,
  flags: { default: false, forced: false, hearingImpaired: false }, ...overrides,
});

test('audio presets use the requested stereo and surround-downmix rates', () => {
  assert.equal(audioBitrate('Streaming', track(), true), '96k');
  assert.equal(audioBitrate('Streaming', track({ channels: 6, isStereo: false }), true), '128k');
  assert.equal(audioBitrate('Archive', track(), true), '224k');
  assert.equal(audioBitrate('Archive', track({ channels: 6, isStereo: false }), true), '256k');
});

test('only high-frequency lossless audio is resampled to 48 kHz', () => {
  assert.equal(shouldResampleLossless(track(), true), true);
  assert.equal(shouldResampleLossless(track({ sampleRate: 44_100 }), true), false);
  assert.equal(shouldResampleLossless(track({ codec: 'mp3', isLossless: false }), true), false);
});

test('rsgain scans the selected root recursively with MAX album mode', () => {
  assert.deepEqual(rsgainArguments('D:\\Music\\converted'), ['easy', '-m', 'MAX', '-S', 'D:\\Music\\converted']);
});

test('rsgain roots are released only after the entire queue succeeds', () => {
  const jobs = [
    { normalizeRoot: 'D:\\Music\\converted' },
    { normalizeRoot: 'D:\\Music\\converted' },
  ];
  assert.deepEqual(successfulNormalizationRoots(jobs, false), []);
  assert.deepEqual(successfulNormalizationRoots(jobs, true), ['D:\\Music\\converted']);
});
