import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  rsgainArguments, shouldResampleLossless, successfulNormalizationRoots,
} from './audio-workflow.ts';
import { parseBuiltInPresetConfiguration } from './presets.ts';
import type { AudioStreamInfo } from './shared-types.ts';

const presets = parseBuiltInPresetConfiguration(fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8')).presets;

const track = (overrides: Partial<AudioStreamInfo> = {}): AudioStreamInfo => ({
  index: 0, codec: 'flac', codecLabel: 'FLAC', language: 'und', languageLabel: 'Undefined',
  channels: 2, channelLayout: 'Stereo', isStereo: true, isAtmos: false, isTrueHd: false,
  isDts: false, isDolbyDigitalPlus: false, bitRate: null, sampleRate: 96_000, isLossless: true,
  flags: { default: false, forced: false, hearingImpaired: false }, ...overrides,
});

test('named presets own their audio codec rates and compressor defaults', () => {
  assert.equal(presets.Streaming.audioRates.opus.stereo, '96k');
  assert.equal(presets.Streaming.audioRates.opus.surround, '128k');
  assert.equal(presets.Archive.audioRates.aac.stereo, '224k');
  assert.equal(presets.Archive.audioRates.aac.surround, '256k');
  assert.equal(presets.Streaming.dynamicRangeCompression, true);
  assert.equal(presets.Archive.dynamicRangeCompression, false);
});

test('music video audio uses libfdk AAC at 224 kbit/s', () => {
  assert.equal(presets['Music Video'].audioRates.aac.stereo, '224k');
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
