import { deepStrictEqual, equal } from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseAppConfiguration } from './config.ts';
import { parseBuiltInPresetConfiguration, resolvePresetOutputDefaults } from './presets.ts';
import {
  bufferSizeFor, scaleDimensionsFor, videoOutputProfile,
} from './video-output-profile.ts';

const configuration = parseBuiltInPresetConfiguration(
  fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8'),
);
const appConfiguration = parseAppConfiguration(fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8'));
const profiles = appConfiguration.videoDefaults.outputProfiles;

test('loads H.264 bitrate baselines and output dimensions from config.ini', () => {
  const cases = [
    { height: 2160, tier: '4k', scale: ['3180', '-2'], videoBitrate: 0, maxRate: 10000 },
    { height: 1080, tier: '1080p', scale: ['1860', '-2'], videoBitrate: 0, maxRate: 7500 },
    { height: 720, tier: '720p', scale: ['1300', '-2'], videoBitrate: 0, maxRate: 4000 },
    { height: 360, tier: '360p', scale: ['-2', '540'], videoBitrate: 0, maxRate: 2500 },
  ] as const;

  for (const expected of cases) {
    const profile = videoOutputProfile(expected.height, 'auto', profiles);
    equal(profile.tier, expected.tier);
    deepStrictEqual(profile.scale, expected.scale);
    equal(profile.videoBitrate, expected.videoBitrate);
    equal(profile.maxRate, expected.maxRate);
  }
});

test('explicit scaling uses the configured output profile instead of the source tier', () => {
  const sourceHeight = 2160;
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '1080p', profiles), ['1860', '-2']);
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '720p', profiles), ['1300', '-2']);
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '360p', profiles), ['-2', '540']);
  equal(videoOutputProfile(sourceHeight, '1080p', profiles).maxRate, 7500);
  equal(videoOutputProfile(sourceHeight, '720p', profiles).maxRate, 4000);
});

test('resolves every Streaming tier CQ and backend quality from presets.ini', () => {
  const streaming = configuration.presets.Streaming;
  equal(resolvePresetOutputDefaults(configuration, streaming, '4k', 'nvenc').quality, '31');
  equal(resolvePresetOutputDefaults(configuration, streaming, '1080p', 'nvenc').quality, '31');
  equal(resolvePresetOutputDefaults(configuration, streaming, '720p', 'nvenc').quality, '32');
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
  equal(music4k.maxRate, 0);
  deepStrictEqual(music4k.resolution, ['2960', '-2']);

  const music1080 = resolvePresetOutputDefaults(configuration, configuration.presets['Music Video'], '1080p', 'nvenc');
  equal(music1080.encoderSpeed, 6);
  equal(music1080.maxRate, 0);
  deepStrictEqual(music1080.resolution, ['-2', '-2']);
});

test('resolves preset profiles and speed tiers independently from configured rates', () => {
  const cases = [
    { preset: 'Archive', tier: '1080p', speed: 6 },
    { preset: 'Regular', tier: '1080p', speed: 4 },
    { preset: 'Streaming', tier: '1080p', speed: 4 },
    { preset: 'Music Video', tier: '1080p', speed: 6 },
    { preset: 'Regular', tier: '720p', speed: 2 },
    { preset: 'Streaming', tier: '360p', speed: 2 },
    { preset: 'Cellular', tier: '360p', speed: 2 },
    { preset: 'Music Video', tier: '720p', speed: 2 },
  ] as const;

  for (const expected of cases) {
    const defaults = resolvePresetOutputDefaults(
      configuration, configuration.presets[expected.preset], expected.tier, 'nvenc', 'H.264',
    );
    equal(defaults.encoderProfile, '1');
    equal(defaults.encoderSpeed, expected.speed);
    equal(defaults.maxRate, 0);
  }

  const streamingHevc = resolvePresetOutputDefaults(
    configuration, configuration.presets.Streaming, '1080p', 'nvenc', 'HEVC',
  );
  equal(streamingHevc.encoderProfile, 'main10');
  equal(streamingHevc.encoderSpeed, 2);
  equal(streamingHevc.maxRate, 0);
  const streamingAv1 = resolvePresetOutputDefaults(
    configuration, configuration.presets.Streaming, '1080p', 'nvenc', 'AV1',
  );
  equal(streamingAv1.maxRate, 0);
  const cellularAv1 = resolvePresetOutputDefaults(
    configuration, configuration.presets.Cellular, '360p', 'nvenc', 'AV1',
  );
  equal(cellularAv1.maxRate, 0);
});

test('H.264 output rate baselines scale using only config.ini codec ratios', () => {
  const { codecRateMultipliers: ratios } = appConfiguration.videoDefaults;
  const h264 = profiles['1080p'].maxRate;
  equal(Math.round(h264 * ratios.hevc), 3750);
  equal(Math.round(h264 * ratios.hevcMain10), 4500);
  equal(Math.round(h264 * ratios.av1), 5625);
  equal(Math.round(h264 * ratios.av1TenBit), 6000);
  equal(appConfiguration.videoDefaults.bufferMultiplier, 3);
});

test('disabled scaling emits no scale filter while retaining the source rate tier', () => {
  equal(scaleDimensionsFor(2160, 'disabled', profiles), null);
  equal(videoOutputProfile(2160, 'disabled', profiles).tier, '4k');
  equal(videoOutputProfile(2160, 'disabled', profiles).maxRate, 10000);
});

test('buffer sizing follows the app-wide config multiplier when max rate changes', () => {
  equal(bufferSizeFor(5000, appConfiguration.videoDefaults.bufferMultiplier), 15000);
  equal(bufferSizeFor(2500, appConfiguration.videoDefaults.bufferMultiplier), 7500);
});
