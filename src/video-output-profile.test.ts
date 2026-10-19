import { deepStrictEqual, equal } from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { parseAppConfiguration } from './config.ts';
import { parseBuiltInPresetConfiguration, resolvePresetOutputDefaults } from './presets.ts';
import {
  bufferSizeFor, resolveVideoOutputRates, scaleDimensionsFor, videoOutputProfile,
} from './video-output-profile.ts';

const configuration = parseBuiltInPresetConfiguration(
  fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8'),
);
const appConfiguration = parseAppConfiguration(fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8'));
const profiles = appConfiguration.videoDefaults.outputProfiles;

test('loads H.264 bitrate baselines and output dimensions from config.ini', () => {
  const cases = [
    { height: 2160, tier: '4k' }, { height: 1080, tier: '1080p' },
    { height: 720, tier: '720p' }, { height: 360, tier: '360p' },
  ] as const;

  for (const expected of cases) {
    const profile = videoOutputProfile(expected.height, 'auto', profiles);
    equal(profile.tier, expected.tier);
    deepStrictEqual(profile.scale, profiles[expected.tier].scale);
    equal(profile.videoBitrate, profiles[expected.tier].videoBitrate);
    equal(profile.maxRate, profiles[expected.tier].maxRate);
  }
});

test('explicit scaling uses the configured output profile instead of the source tier', () => {
  const sourceHeight = 2160;
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '1080p', profiles), profiles['1080p'].scale);
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '720p', profiles), profiles['720p'].scale);
  deepStrictEqual(scaleDimensionsFor(sourceHeight, '360p', profiles), profiles['360p'].scale);
  equal(videoOutputProfile(sourceHeight, '1080p', profiles).maxRate, profiles['1080p'].maxRate);
  equal(videoOutputProfile(sourceHeight, '720p', profiles).maxRate, profiles['720p'].maxRate);
});

test('resolves every Streaming tier CQ and backend quality from presets.ini', () => {
  const streaming = configuration.presets.Streaming;
  for (const tier of ['4k', '1080p', '720p', '360p'] as const) {
    equal(resolvePresetOutputDefaults(configuration, streaming, tier, 'nvenc').quality, streaming.quality.nvenc);
  }
  for (const family of ['amf', 'qsv', 'vaapi', 'videotoolbox', 'software'] as const) {
    equal(resolvePresetOutputDefaults(configuration, streaming, '1080p', family).quality,
      streaming.outputTierDefaults['1080p'].quality[family] ?? streaming.quality[family]);
  }
});

test('resolves Cellular delivery and Music Video tier overrides from presets.ini', () => {
  const streaming360 = resolvePresetOutputDefaults(configuration, configuration.presets.Streaming, '360p', 'nvenc');
  equal(streaming360.deliveryPreset.name, 'Cellular');

  const music4k = resolvePresetOutputDefaults(configuration, configuration.presets['Music Video'], '4k', 'nvenc');
  equal(music4k.encoderSpeed, configuration.presets['Music Video'].encoderSpeed);
  equal(music4k.maxRate, configuration.presets['Music Video'].outputTierDefaults['4k'].maxRate);
  deepStrictEqual(music4k.resolution, ['2960', '-2']);

  const music1080 = resolvePresetOutputDefaults(configuration, configuration.presets['Music Video'], '1080p', 'nvenc');
  equal(music1080.encoderSpeed, configuration.presets['Music Video'].encoderSpeed);
  equal(music1080.maxRate, configuration.presets['Music Video'].outputTierDefaults['1080p'].maxRate);
  deepStrictEqual(music1080.resolution, ['-2', '-2']);
});

test('resolves preset profiles and speed tiers independently from configured rates', () => {
  const cases = [
    { preset: 'Archive', tier: '1080p' },
    { preset: 'Regular', tier: '1080p' },
    { preset: 'Streaming', tier: '1080p' },
    { preset: 'Music Video', tier: '1080p' },
    { preset: 'Regular', tier: '720p' },
    { preset: 'Streaming', tier: '360p' },
    { preset: 'Cellular', tier: '360p' },
    { preset: 'Music Video', tier: '720p' },
  ] as const;

  for (const expected of cases) {
    const defaults = resolvePresetOutputDefaults(
      configuration, configuration.presets[expected.preset], expected.tier, 'nvenc', 'H.264',
    );
    const preset = configuration.presets[expected.preset];
    const tierDefaults = preset.outputTierDefaults[expected.tier];
    equal(defaults.encoderProfile, preset.encoderProfile['H.264'] ?? '');
    equal(defaults.encoderSpeed, tierDefaults.codec['H.264']?.encoderSpeed ?? tierDefaults.encoderSpeed ?? preset.encoderSpeed);
    equal(defaults.maxRate, tierDefaults.codec['H.264']?.maxRate ?? tierDefaults.maxRate ?? configuration.outputProfiles[expected.tier].maxRate);
  }

  const streamingHevc = resolvePresetOutputDefaults(
    configuration, configuration.presets.Streaming, '1080p', 'nvenc', 'HEVC',
  );
  equal(streamingHevc.encoderProfile, 'main10');
  equal(streamingHevc.encoderSpeed, configuration.presets.Streaming.encoderSpeed);
  equal(streamingHevc.maxRate, configuration.presets.Streaming.outputTierDefaults['1080p'].maxRate);
  const streamingAv1 = resolvePresetOutputDefaults(
    configuration, configuration.presets.Streaming, '1080p', 'nvenc', 'AV1',
  );
  equal(streamingAv1.maxRate, configuration.presets.Streaming.outputTierDefaults['1080p'].maxRate);
  const cellularAv1 = resolvePresetOutputDefaults(
    configuration, configuration.presets.Cellular, '360p', 'nvenc', 'AV1',
  );
  equal(cellularAv1.maxRate, 0);
});

test('H.264 output rate baselines scale using only config.ini codec ratios', () => {
  const { codecRateMultipliers: ratios } = appConfiguration.videoDefaults;
  const h264 = profiles['1080p'].maxRate;
  equal(Math.round(h264 * ratios.hevc), resolveVideoOutputRates(profiles['1080p'], {}, ratios.hevc, 1).maxRate);
  equal(Math.round(h264 * ratios.hevcMain10), resolveVideoOutputRates(profiles['1080p'], {}, ratios.hevcMain10, 1).maxRate);
  equal(Math.round(h264 * ratios.av1), resolveVideoOutputRates(profiles['1080p'], {}, ratios.av1, 1).maxRate);
  equal(Math.round(h264 * ratios.av1TenBit), resolveVideoOutputRates(profiles['1080p'], {}, ratios.av1TenBit, 1).maxRate);
});

test('disabled scaling emits no scale filter while retaining the source rate tier', () => {
  equal(scaleDimensionsFor(2160, 'disabled', profiles), null);
  equal(videoOutputProfile(2160, 'disabled', profiles).tier, '4k');
  equal(videoOutputProfile(2160, 'disabled', profiles).maxRate, profiles['4k'].maxRate);
});

test('buffer sizing follows the app-wide config multiplier when max rate changes', () => {
  const rate = profiles['1080p'].maxRate;
  equal(bufferSizeFor(rate, appConfiguration.videoDefaults.bufferMultiplier), rate * appConfiguration.videoDefaults.bufferMultiplier);
  const hevcRate = Math.round(rate * appConfiguration.videoDefaults.codecRateMultipliers.hevc);
  equal(bufferSizeFor(hevcRate, appConfiguration.videoDefaults.bufferMultiplier), hevcRate * appConfiguration.videoDefaults.bufferMultiplier);
});

test('preset rate overrides use config.ini codec ratios and buffer multiplier', () => {
  const preset = configuration.presets.Streaming;
  const tier = '1080p';
  const override = preset.outputTierDefaults[tier];
  const h264 = resolveVideoOutputRates(profiles[tier], override, 1, appConfiguration.videoDefaults.bufferMultiplier);
  equal(h264.maxRate, override.maxRate);
  const ratio = appConfiguration.videoDefaults.codecRateMultipliers.hevcMain10;
  const hevcMain10 = resolveVideoOutputRates(profiles[tier], override, ratio, appConfiguration.videoDefaults.bufferMultiplier);
  equal(hevcMain10.maxRate, Math.round(h264.maxRate * ratio));
  equal(hevcMain10.bufferSize, hevcMain10.maxRate * appConfiguration.videoDefaults.bufferMultiplier);
});
