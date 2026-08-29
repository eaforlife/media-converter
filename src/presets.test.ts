import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { advancedVideoArguments } from './advanced-video-settings.ts';
import { encoderSpeedArguments, encoderTuneArguments } from './encoder-controls.ts';
import { parseBuiltInPresetConfiguration, parseBuiltInPresets, predefinedPresetNames } from './presets.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');

test('loads ordered built-in preset values from presets.ini', () => {
  const configuration = parseBuiltInPresetConfiguration(presetFile);
  const presets = configuration.presets;
  assert.equal(configuration.version, '384aa14');
  assert.deepEqual(Object.keys(presets), ['Archive', 'Regular', 'Streaming', 'Cellular', 'Music Video']);
  assert.equal(presets.Streaming.audioCodec, 'opus');
  assert.equal(presets.Streaming.audioRates.opus.stereo, '96k');
  assert.equal(presets.Streaming.audioRates.opus.surround, '128k');
  assert.equal(presets.Streaming.encoderSpeed, 2);
  assert.equal(presets.Streaming.bufferMultiplier, 3);
  assert.equal(presets.Streaming.encoderTune.nvenc, 'hq');
  assert.equal(presets.Streaming.encoderTune.amf, 'high_quality');
  assert.equal(presets.Streaming.quality.nvenc, '29');
  assert.equal(presets.Regular.quality.nvenc, '24');
  assert.equal(presets.Regular.quality.amf, '22');
  assert.equal(presets.Regular.quality.software, '25');
  assert.equal(presets.Regular.advancedVideo.spatialAq, 10);
  assert.equal(presets.Archive.dynamicRangeCompression, false);
  for (const name of ['Regular', 'Streaming', 'Cellular', 'Music Video'] as const) {
    assert.equal(presets[name].dynamicRangeCompression, true);
  }
  assert.deepEqual(presets.Streaming.advancedVideo, {
    bFrames: true, multipass: 2, bRefMode: 'middle', adaptiveBFrames: true,
    sceneCutDetection: true, rcLookahead: 26, nonReferenceP: false, spatialAq: 12, temporalAq: false,
  });
  assert.equal(presets.Cellular.advancedVideo.spatialAq, 12);
  assert.equal(presets['Music Video'].advancedVideo.spatialAq, 12);
});

test('automatically exposes new predefined sections while keeping Music Video workflow-only', () => {
  const regularSection = presetFile.match(/\[Regular\][\s\S]*?(?=\r?\n\[Streaming\])/)?.[0];
  assert.ok(regularSection);
  const presets = parseBuiltInPresets(`${presetFile.trim()}\n\n${regularSection.replace('[Regular]', '[Cinema]')}\n`);
  assert.deepEqual(predefinedPresetNames(presets, false), ['Archive', 'Regular', 'Streaming', 'Cellular', 'Cinema']);
  assert.deepEqual(predefinedPresetNames(presets, true), ['Music Video']);
  assert.equal(presets.Cinema.quality.nvenc, presets.Regular.quality.nvenc);
});

test('Music Video maps upstream UHQ intent to Jellyfin-compatible AV1 NVENC settings', () => {
  const preset = parseBuiltInPresets(presetFile)['Music Video'];
  assert.equal(preset.preferredVideoCodec, 'AV1');
  assert.equal(preset.quality.nvenc, '26');
  assert.deepEqual(
    [preset.outputTierDefaults['4k'].encoderSpeed, preset.outputTierDefaults['4k'].maxRate, preset.outputTierDefaults['4k'].resolution],
    [6, 11000, ['2960', '-2']],
  );
  assert.deepEqual(
    [preset.outputTierDefaults['1080p'].encoderSpeed, preset.outputTierDefaults['1080p'].maxRate, preset.outputTierDefaults['1080p'].resolution],
    [6, 7000, ['-2', '-2']],
  );
  assert.deepEqual(encoderSpeedArguments('av1_nvenc', preset.outputTierDefaults['4k'].encoderSpeed!), ['-preset', 'p6']);
  assert.deepEqual(encoderSpeedArguments('av1_nvenc', preset.outputTierDefaults['1080p'].encoderSpeed!), ['-preset', 'p6']);
  assert.deepEqual(encoderTuneArguments('av1_nvenc', preset.encoderTune.nvenc), ['-tune', 'hq']);
  assert.deepEqual(advancedVideoArguments('av1_nvenc', preset.advancedVideo), [
    '-multipass', '2', '-bf', '4', '-b_ref_mode', 'middle', '-b_adapt', '1',
    '-no-scenecut', '0', '-rc-lookahead', '26', '-nonref_p', '0',
    '-spatial-aq', '1', '-temporal-aq', '0', '-aq-strength', '12',
  ]);
  assert.equal(preset.bitrateControl, true);
  assert.equal(preset.bufferMultiplier, 3);
});

test('streaming tiers retain their own speed and CQ around the shared UHQ-compatible stack', () => {
  const presets = parseBuiltInPresets(presetFile);
  assert.deepEqual(
    [presets.Streaming.encoderSpeed, presets.Streaming.quality.nvenc],
    [2, '29'],
  );
  assert.deepEqual(
    [presets.Cellular.encoderSpeed, presets.Cellular.quality.nvenc],
    [2, '32'],
  );
  for (const name of ['Streaming', 'Cellular', 'Music Video'] as const) {
    assert.equal(presets[name].encoderTune.nvenc, 'hq');
  }
  assert.equal(presets.Streaming.advancedVideo.spatialAq, 12);
  assert.equal(presets.Cellular.advancedVideo.spatialAq, 12);
  assert.equal(presets['Music Video'].advancedVideo.spatialAq, 12);
});

test('rejects out-of-range editable preset values', () => {
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('[Version: 384aa14]', '[Version: current]')),
    /must begin with \[Version: <commit>\]/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('rc_lookahead=26', 'rc_lookahead=43')),
    /rc_lookahead must be an integer from 0 to 42/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('encoder_speed_4k=6', 'encoder_speed_4k=8')),
    /encoder_speed_4k must be an integer from 1 to 7/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('max_rate_4k=11000', 'max_rate_4k=0')),
    /max_rate_4k must be an integer from 1 to 1000000/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('dynamic_range_compression=0', 'dynamic_range_compression=2')),
    /dynamic_range_compression must be 0 or 1/,
  );
});
