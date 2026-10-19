import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { advancedVideoArguments } from './advanced-video-settings.ts';
import { parseAppConfiguration } from './config.ts';
import { iniVersion } from './ini-version.ts';
import { encoderSpeedArguments, encoderTuneArguments } from './encoder-controls.ts';
import {
  parseBuiltInPresetConfiguration, parseBuiltInPresets, predefinedPresetNames,
  preferredVideoCodecForPreset, resolvePresetAdvancedVideo,
} from './presets.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');
const configFile = fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8');
const appConfig = parseAppConfiguration(configFile);

test('loads ordered built-in preset values from presets.ini', () => {
  const configuration = parseBuiltInPresetConfiguration(presetFile);
  const presets = configuration.presets;
  assert.equal(configuration.version, iniVersion(presetFile));
  assert.deepEqual(Object.keys(presets), ['Archive', 'Regular', 'Streaming', 'Cellular', 'Music Video']);
  assert.equal(presets.Streaming.audioCodec, 'opus');
  assert.equal(presets.Streaming.frameRate, 23.976);
  assert.equal(presets.Cellular.frameRate, 23.976);
  assert.equal(presets.Archive.frameRate, 'passthrough');
  assert.equal(presets.Regular.frameRate, 'passthrough');
  assert.equal(presets['Music Video'].frameRate, 'passthrough');
  assert.equal(presets.Streaming.audioRates.opus.stereo, '96k');
  assert.equal(presets.Streaming.audioRates.opus.surround, '128k');
  assert.equal(preferredVideoCodecForPreset(presets.Streaming, '1080p'), 'HEVC');
  assert.equal(preferredVideoCodecForPreset(presets.Streaming, '720p'), 'AV1');
  assert.equal(preferredVideoCodecForPreset(presets.Streaming, '360p'), 'AV1');
  assert.deepEqual(presets.Streaming.encoderProfile, {});
  assert.equal(presets.Archive.preferredVideoCodec, 'H.264');
  assert.equal(presets.Regular.preferredVideoCodec, 'H.264');
  assert.equal(presets.Archive.encoderProfile['H.264'], undefined);
  assert.equal(presets.Regular.encoderProfile['H.264'], undefined);
  assert.equal(presets.Archive.bitrateControl, true);
  for (const name of Object.keys(presets)) {
    assert.ok(presets[name].encoderTune.nvenc !== undefined);
  }
  assert.equal(presets.Archive.dynamicRangeCompression, false);
  for (const name of ['Regular', 'Streaming', 'Cellular', 'Music Video'] as const) {
    assert.equal(presets[name].dynamicRangeCompression, true);
  }
  assert.deepEqual(presets.Streaming.advancedVideo, parseBuiltInPresets(presetFile).Streaming.advancedVideo);
});

test('automatically exposes new predefined sections while keeping Music Video workflow-only', () => {
  const regularSection = presetFile.match(/\[Regular\][\s\S]*?(?=\r?\n\[Streaming\])/)?.[0];
  assert.ok(regularSection);
  const presets = parseBuiltInPresets(`${presetFile.trim()}\n\n${regularSection.replace('[Regular]', '[Cinema]')}\n`);
  assert.deepEqual(predefinedPresetNames(presets, false), ['Archive', 'Regular', 'Streaming', 'Cellular', 'Cinema']);
  assert.deepEqual(predefinedPresetNames(presets, true), ['Music Video']);
  assert.equal(presets.Cinema.quality.nvenc, presets.Regular.quality.nvenc);
});

test('Music Video uses the Streaming video profile with Main10 and NVENC P6', () => {
  const preset = parseBuiltInPresets(presetFile)['Music Video'];
  const advanced = resolvePresetAdvancedVideo(preset, 'HEVC');
  assert.equal(preset.preferredVideoCodec, appConfig.videoDefaults.codec);
  assert.equal(preset.defaultMain10, true);
  assert.equal(preset.quality.nvenc, parseBuiltInPresets(presetFile).Streaming.quality.nvenc);
  assert.equal(preset.outputTierDefaults['4k'].resolution?.[0], '2960');
  assert.equal(preset.outputTierDefaults['1080p'].resolution?.[1], '-2');
  assert.deepEqual(encoderSpeedArguments('hevc_nvenc', preset.encoderSpeed), ['-preset', `p${preset.encoderSpeed}`]);
  assert.deepEqual(encoderTuneArguments('hevc_nvenc', preset.encoderTune.nvenc), ['-tune', 'hq']);
  assert.equal(preset.advancedVideo.spatialAq, appConfig.videoDefaults.main10Advanced.spatialAq);
  assert.equal(advanced.bFrames, false);
  assert.deepEqual(advancedVideoArguments('hevc_nvenc', advanced), [
    '-multipass', String(advanced.multipass), '-bf', '0', '-b_ref_mode', 'middle', '-b_adapt', '1',
    '-no-scenecut', '0', '-rc-lookahead', '26', '-nonref_p', '0',
    '-spatial-aq', '1', '-temporal-aq', '0', '-aq-strength', String(preset.advancedVideo.spatialAq),
  ]);
  assert.equal(preset.bitrateControl, parseBuiltInPresets(presetFile).Streaming.bitrateControl);
});

test('streaming tiers retain their configured speed and advanced settings', () => {
  const presets = parseBuiltInPresets(presetFile);
  assert.equal(presets.Cellular.encoderSpeed, presets.Streaming.encoderSpeed);
  assert.equal(presets.Cellular.quality.nvenc, presets.Streaming.quality.nvenc);
  for (const name of ['Streaming', 'Cellular', 'Music Video'] as const) {
    assert.equal(presets[name].encoderTune.nvenc, 'hq');
  }
  assert.equal(presets.Streaming.advancedVideo.spatialAq, parseBuiltInPresets(presetFile).Streaming.advancedVideo.spatialAq);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1').bFrames, false);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').spatialAq, 0);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').temporalAq, true);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1').bFrames, false);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').spatialAq, 0);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').temporalAq, true);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'HEVC', '360p').spatialAq, 12);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'HEVC', '360p').temporalAq, false);
  assert.equal(presets.Cellular.advancedVideo.spatialAq, parseBuiltInPresets(presetFile).Cellular.advancedVideo.spatialAq);
  assert.equal(presets['Music Video'].advancedVideo.spatialAq, appConfig.videoDefaults.main10Advanced.spatialAq);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'HEVC', '4k').multipass, 0);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'HEVC', '1080p').multipass, 1);
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').multipass, 1);
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').multipass, 1);
});

test('preset file contains no obsolete rate, output, tier-quality, or profile settings', () => {
  const presets = parseBuiltInPresets(presetFile);
  assert.doesNotMatch(presetFile, /^\[Output: /m);
  assert.doesNotMatch(presetFile, /^(?:video_bitrate|(?:h264_)?max_rate(?:_[^=]+)?|buffer_multiplier|bitrate_multiplier_[^=]+|profile_(?:h264|hevc|av1)|encoder_speed_h264_[^=]+|quality_[^=]+_(?:4k|1080p|720p|360p))=/m);
  assert.deepEqual(presets.Streaming.encoderProfile, {});
  assert.deepEqual(presets['Music Video'].encoderProfile, {});
  assert.equal(presets['Music Video'].scaleLocked, true);
});

test('rejects out-of-range editable preset values', () => {
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace(/\[Version: [^\]]+\]/, '[Version: current]')),
    /must begin with \[Version: <major.minor.patch>\]/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('rc_lookahead=26', 'rc_lookahead=43')),
    /rc_lookahead must be an integer from 0 to 42/,
  );
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('encoder_speed=6', 'encoder_speed=8')),
    /encoder_speed must be an integer from 1 to 7/,
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
