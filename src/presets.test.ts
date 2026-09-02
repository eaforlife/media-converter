import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { advancedVideoArguments } from './advanced-video-settings.ts';
import { encoderSpeedArguments, encoderTuneArguments } from './encoder-controls.ts';
import {
  parseBuiltInPresetConfiguration, parseBuiltInPresets, predefinedPresetNames,
  preferredVideoCodecForPreset, resolvePresetAdvancedVideo,
} from './presets.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');

test('loads ordered built-in preset values from presets.ini', () => {
  const configuration = parseBuiltInPresetConfiguration(presetFile);
  const presets = configuration.presets;
  assert.equal(configuration.version, '79c799a');
  assert.deepEqual(Object.keys(presets), ['Archive', 'Regular', 'Streaming', 'Cellular', 'Music Video']);
  assert.equal(presets.Streaming.audioCodec, 'opus');
  assert.equal(presets.Streaming.frameRate, 23.976);
  assert.equal(presets.Cellular.frameRate, 23.976);
  assert.equal(presets.Archive.frameRate, 'passthrough');
  assert.equal(presets.Regular.frameRate, 'passthrough');
  assert.equal(presets['Music Video'].frameRate, 'passthrough');
  assert.equal(presets.Streaming.audioRates.opus.stereo, '96k');
  assert.equal(presets.Streaming.audioRates.opus.surround, '128k');
  assert.equal(presets.Streaming.encoderSpeed, 2);
  assert.equal(presets.Streaming.preferredVideoCodec, 'HEVC');
  assert.equal(preferredVideoCodecForPreset(presets.Streaming, '1080p'), 'HEVC');
  assert.equal(preferredVideoCodecForPreset(presets.Streaming, '720p'), 'AV1');
  assert.equal(preferredVideoCodecForPreset(presets.Streaming, '360p'), 'AV1');
  assert.equal(presets.Streaming.encoderProfile.HEVC, 'main');
  assert.equal(presets.Archive.preferredVideoCodec, 'H.264');
  assert.equal(presets.Regular.preferredVideoCodec, 'H.264');
  assert.equal(presets.Archive.encoderProfile['H.264'], 'high');
  assert.equal(presets.Regular.encoderProfile['H.264'], 'high');
  assert.equal(presets.Archive.bitrateControl, true);
  assert.equal(presets.Streaming.bufferMultiplier, 1);
  assert.equal(presets.Streaming.encoderTune.nvenc, 'hq');
  assert.equal(presets.Streaming.encoderTune.amf, 'high_quality');
  assert.equal(presets.Streaming.quality.nvenc, '31');
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
  const advanced = resolvePresetAdvancedVideo(preset, 'AV1');
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
  assert.equal(advanced.bFrames, false);
  assert.deepEqual(advancedVideoArguments('av1_nvenc', advanced), [
    '-multipass', '2', '-b_ref_mode', 'middle', '-b_adapt', '1',
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
    [2, '31'],
  );
  assert.deepEqual(
    [presets.Cellular.encoderSpeed, presets.Cellular.quality.nvenc],
    [2, '32'],
  );
  for (const name of ['Streaming', 'Cellular', 'Music Video'] as const) {
    assert.equal(presets[name].encoderTune.nvenc, 'hq');
  }
  assert.equal(presets.Streaming.advancedVideo.spatialAq, 12);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1').bFrames, false);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').spatialAq, 0);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').temporalAq, true);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1').bFrames, false);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').spatialAq, 0);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').temporalAq, true);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'HEVC', '360p').spatialAq, 12);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'HEVC', '360p').temporalAq, false);
  assert.equal(presets.Cellular.advancedVideo.spatialAq, 12);
  assert.equal(presets['Music Video'].advancedVideo.spatialAq, 12);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'HEVC', '4k').multipass, 0);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'HEVC', '1080p').multipass, 1);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').multipass, 1);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').multipass, 1);
});

test('loads codec-specific H.264 tier overrides from presets.ini', () => {
  const presets = parseBuiltInPresets(presetFile);
  assert.deepEqual(presets.Regular.outputTierDefaults['1080p'].codec['H.264'], {
    encoderSpeed: 4, videoBitrate: undefined, maxRate: 8000,
  });
  assert.deepEqual(presets.Streaming.outputTierDefaults['720p'].codec['H.264'], {
    encoderSpeed: 2, videoBitrate: undefined, maxRate: 4000,
  });
  assert.deepEqual(presets['Music Video'].outputTierDefaults['360p'].codec['H.264'], {
    encoderSpeed: 2, videoBitrate: undefined, maxRate: 4000,
  });
});

test('rejects out-of-range editable preset values', () => {
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('[Version: 79c799a]', '[Version: current]')),
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
    () => parseBuiltInPresets(presetFile.replace('max_rate_h264_1080p=10000', 'max_rate_h264_1080p=0')),
    /max_rate_h264_1080p must be an integer from 1 to 1000000/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('dynamic_range_compression=0', 'dynamic_range_compression=2')),
    /dynamic_range_compression must be 0 or 1/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('frame_rate=23.976', 'frame_rate=0')),
    /frame_rate must be passthrough or a number from 1 to 240/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('multipass_4k=0', 'multipass_4k=3')),
    /multipass_4k must be an integer from 0 to 2/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('preferred_video_codec_720p=AV1', 'preferred_video_codec_720p=VP9')),
    /preferred_video_codec_720p must be one of: H\.264, HEVC, AV1/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('b_frames_av1=0', 'b_frames_av1=2')),
    /b_frames_av1 must be 0 or 1/,
  );
});
