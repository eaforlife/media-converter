import { deepStrictEqual, equal } from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseBuiltInPresetConfiguration, resolvePresetOutputDefaults } from './presets.ts';
import {
  bufferSizeFor, scaleDimensionsFor, videoOutputProfile,
} from './video-output-profile.ts';

const configuration = parseBuiltInPresetConfiguration(
  fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8'),
);
const profiles = configuration.outputProfiles;

test('loads every output tier value from presets.ini', () => {
  const cases = [
    { height: 2160, tier: '4k', scale: ['2720', '-2'], videoBitrate: 0, maxRate: 8000 },
    { height: 1080, tier: '1080p', scale: ['1760', '-2'], videoBitrate: 0, maxRate: 5000 },
    { height: 720, tier: '720p', scale: ['1320', '-2'], videoBitrate: 0, maxRate: 2500 },
    { height: 360, tier: '360p', scale: ['720', '-2'], videoBitrate: 0, maxRate: 2500 },
  ] as const;

  for (const expected of cases) {
    const profile = videoOutputProfile(expected.height, 'auto', profiles);
    equal(profile.tier, expected.tier);
    deepStrictEqual(profile.scale, expected.scale);
    equal(profile.videoBitrate, expected.videoBitrate);
    equal(profile.maxRate, expected.maxRate);
  }
});

test('explicit scaling uses the selected INI output profile instead of the source tier', () => {
  const sourceHeight = 2160;
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '1080p', profiles), ['1760', '-2']);
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '720p', profiles), ['1320', '-2']);
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '360p', profiles), ['720', '-2']);
  equal(videoOutputProfile(sourceHeight, '1080p', profiles).maxRate, 5000);
  equal(videoOutputProfile(sourceHeight, '720p', profiles).maxRate, 2500);
});

test('resolves every Streaming tier CQ and backend quality from presets.ini', () => {
  const streaming = configuration.presets.Streaming;
  equal(resolvePresetOutputDefaults(configuration, streaming, '4k', 'nvenc').quality, '29');
  equal(resolvePresetOutputDefaults(configuration, streaming, '1080p', 'nvenc').quality, '28');
  equal(resolvePresetOutputDefaults(configuration, streaming, '720p', 'nvenc').quality, '29');
  equal(resolvePresetOutputDefaults(configuration, streaming, '360p', 'nvenc').quality, '32');
  equal(resolvePresetOutputDefaults(configuration, streaming, '1080p', 'amf').quality, '26');
  equal(resolvePresetOutputDefaults(configuration, streaming, '1080p', 'qsv').quality, '27');
  equal(resolvePresetOutputDefaults(configuration, streaming, '1080p', 'vaapi').quality, '26');
  equal(resolvePresetOutputDefaults(configuration, streaming, '1080p', 'videotoolbox').quality, '27');
  equal(resolvePresetOutputDefaults(configuration, streaming, '1080p', 'software').quality, '29');
});

test('resolves Cellular delivery and Music Video tier overrides from presets.ini', () => {
  const streaming360 = resolvePresetOutputDefaults(configuration, configuration.presets.Streaming, '360p', 'nvenc');
  equal(streaming360.deliveryPreset.name, 'Cellular');

  const music4k = resolvePresetOutputDefaults(configuration, configuration.presets['Music Video'], '4k', 'nvenc');
  equal(music4k.encoderSpeed, 6);
  equal(music4k.maxRate, 11000);
  deepStrictEqual(music4k.resolution, ['2960', '-2']);

  const music1080 = resolvePresetOutputDefaults(configuration, configuration.presets['Music Video'], '1080p', 'nvenc');
  equal(music1080.encoderSpeed, 6);
  equal(music1080.maxRate, 7000);
  deepStrictEqual(music1080.resolution, ['-2', '-2']);
});

test('resolves H.264-only rates, profiles, and speed tiers from presets.ini', () => {
  const cases = [
    { preset: 'Archive', tier: '1080p', speed: 6, maxRate: 10000 },
    { preset: 'Regular', tier: '1080p', speed: 4, maxRate: 8000 },
    { preset: 'Streaming', tier: '1080p', speed: 4, maxRate: 6500 },
    { preset: 'Music Video', tier: '1080p', speed: 6, maxRate: 7000 },
    { preset: 'Regular', tier: '720p', speed: 2, maxRate: 4000 },
    { preset: 'Streaming', tier: '360p', speed: 2, maxRate: 4000 },
    { preset: 'Cellular', tier: '360p', speed: 2, maxRate: 4000 },
    { preset: 'Music Video', tier: '720p', speed: 2, maxRate: 4000 },
  ] as const;

  for (const expected of cases) {
    const defaults = resolvePresetOutputDefaults(
      configuration, configuration.presets[expected.preset], expected.tier, 'nvenc', 'H.264',
    );
    equal(defaults.encoderProfile, 'high');
    equal(defaults.encoderSpeed, expected.speed);
    equal(defaults.maxRate, expected.maxRate);
  }

  const streamingHevc = resolvePresetOutputDefaults(
    configuration, configuration.presets.Streaming, '1080p', 'nvenc', 'HEVC',
  );
  equal(streamingHevc.encoderProfile, 'main');
  equal(streamingHevc.encoderSpeed, 2);
  equal(streamingHevc.maxRate, 5000);
});

test('disabled scaling emits no scale filter while retaining the source rate tier', () => {
  equal(scaleDimensionsFor(2160, 'disabled', profiles), null);
  equal(videoOutputProfile(2160, 'disabled', profiles).tier, '4k');
  equal(videoOutputProfile(2160, 'disabled', profiles).maxRate, 8000);
});

test('buffer sizing retains the preset multiplier when max rate changes', () => {
  equal(bufferSizeFor(7000, 2), 14000);
  equal(bufferSizeFor(2500, 2), 5000);
});
