import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  rsgainArguments, shouldResampleLossless, successfulNormalizationRoots,
} from './audio-workflow.ts';
import { parseBuiltInPresetConfiguration, parseIniSections } from './presets.ts';
import type { AudioStreamInfo } from './shared-types.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');
const presetSections = parseIniSections(presetFile);
const presets = parseBuiltInPresetConfiguration(presetFile).presets;
const presetValue = (preset: string, key: string) => {
  const value = presetSections.get(preset)?.get(key);
  assert.notEqual(value, undefined, `[${preset}] ${key} should exist in presets.ini`);
  return value!;
};

const track = (overrides: Partial<AudioStreamInfo> = {}): AudioStreamInfo => ({
  index: 0, codec: 'flac', codecLabel: 'FLAC', language: 'und', languageLabel: 'Undefined',
  channels: 2, channelLayout: 'Stereo', isStereo: true, isAtmos: false, isTrueHd: false,
  isDts: false, isDolbyDigitalPlus: false, bitRate: null, sampleRate: 96_000, isLossless: true,
  flags: { default: false, forced: false, hearingImpaired: false }, ...overrides,
});

test('named presets own their audio codec rates and compressor defaults', () => {
  assert.equal(presets.Streaming.audioRates.opus.stereo, presetValue('Streaming', 'audio_opus_stereo'));
  assert.equal(presets.Streaming.audioRates.opus.surround, presetValue('Streaming', 'audio_opus_downmix'));
  assert.equal(presets.Archive.audioRates.aac.stereo, presetValue('Archive', 'audio_aac_stereo'));
  assert.equal(presets.Archive.audioRates.aac.surround, presetValue('Archive', 'audio_aac_downmix'));
  assert.equal(presets.Streaming.dynamicRangeCompression,
    ['1', 'true'].includes(presetValue('Streaming', 'dynamic_range_compression')));
  assert.equal(presets.Archive.dynamicRangeCompression,
    ['1', 'true'].includes(presetValue('Archive', 'dynamic_range_compression')));
});

test('Music Video audio values follow presets.ini', () => {
  assert.equal(presets['Music Video'].audioCodec, presetValue('Music Video', 'audio_codec'));
  assert.equal(presets['Music Video'].audioRates.opus.stereo, presetValue('Music Video', 'audio_opus_stereo'));
  assert.equal(presets['Music Video'].audioRates.opus.surround, presetValue('Music Video', 'audio_opus_downmix'));
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
