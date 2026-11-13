import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { advancedVideoArguments } from './advanced-video-settings.ts';
import { parseAppConfiguration } from './config.ts';
import { iniVersion } from './ini-version.ts';
import { encoderSpeedArguments, encoderTuneArguments } from './encoder-controls.ts';
import {
  parseBuiltInPresetConfiguration, parseBuiltInPresets, parseIniSections, predefinedPresetNames,
  preferredVideoCodecForPreset, resolvePresetAdvancedVideo, resolvePresetJobBehavior,
} from './presets.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');
const configFile = fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8');
const appConfig = parseAppConfiguration(configFile);
const presetSections = parseIniSections(presetFile);
const presetValue = (preset: string, key: string) => {
  const value = presetSections.get(preset)?.get(key);
  assert.notEqual(value, undefined, `[${preset}] ${key} should exist in presets.ini`);
  return value!;
};
const presetBoolean = (preset: string, key: string) => ['1', 'true'].includes(presetValue(preset, key));
const presetNumber = (preset: string, key: string) => Number(presetValue(preset, key));
const presetFrameRate = (preset: string) => {
  const value = presetSections.get(preset)?.get('frame_rate') || 'passthrough';
  return value === 'passthrough' ? value : Number(value);
};
const setPresetValue = (ini: string, preset: string, key: string, value: string) => {
  const header = `[${preset}]`;
  const start = ini.indexOf(header);
  assert.notEqual(start, -1, `[${preset}] should exist in presets.ini`);
  const nextSection = ini.indexOf('\n[', start + header.length);
  const end = nextSection < 0 ? ini.length : nextSection;
  const section = ini.slice(start, end);
  const keyPattern = new RegExp(`^${key}=.*$`, 'm');
  const updated = keyPattern.test(section)
    ? section.replace(keyPattern, `${key}=${value}`)
    : `${section.trimEnd()}\n${key}=${value}`;
  return `${ini.slice(0, start)}${updated}${ini.slice(end)}`;
};

test('loads ordered built-in preset values from presets.ini', () => {
  const configuration = parseBuiltInPresetConfiguration(presetFile);
  const presets = configuration.presets;
  assert.equal(configuration.version, iniVersion(presetFile));
  assert.deepEqual(Object.keys(presets), [...presetSections.keys()].filter((name) => !name.startsWith('Version: ')));
  assert.equal(presets.Streaming.audioCodec, presetValue('Streaming', 'audio_codec'));
  for (const name of Object.keys(presets)) assert.equal(presets[name].frameRate, presetFrameRate(name));
  assert.equal(presets.Streaming.audioRates.opus.stereo, presetValue('Streaming', 'audio_opus_stereo'));
  assert.equal(presets.Streaming.audioRates.opus.surround, presetValue('Streaming', 'audio_opus_downmix'));
  for (const tier of ['4k', '1080p', '720p', '360p'] as const) {
    assert.equal(preferredVideoCodecForPreset(presets.Streaming, tier),
      presetSections.get('Streaming')?.get(`preferred_video_codec_${tier}`)
        ?? presetValue('Streaming', 'preferred_video_codec'));
  }
  assert.deepEqual(presets.Streaming.encoderProfile, {});
  assert.equal(presets.Archive.preferredVideoCodec, presetValue('Archive', 'preferred_video_codec'));
  assert.equal(presets.Regular.preferredVideoCodec, presetValue('Regular', 'preferred_video_codec'));
  assert.equal(presets.Archive.encoderProfile['H.264'], undefined);
  assert.equal(presets.Regular.encoderProfile['H.264'], undefined);
  assert.equal(presets.Archive.bitrateControl, presetBoolean('Archive', 'bitrate_control'));
  for (const name of Object.keys(presets)) {
    assert.ok(presets[name].encoderTune.nvenc !== undefined);
  }
  for (const name of Object.keys(presets)) {
    assert.equal(presets[name].dynamicRangeCompression, presetBoolean(name, 'dynamic_range_compression'));
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

test('Music Video codec and tier defaults follow presets.ini', () => {
  const preset = parseBuiltInPresets(presetFile)['Music Video'];
  const advanced = resolvePresetAdvancedVideo(preset, 'HEVC');
  assert.equal(preset.preferredVideoCodec, presetValue('Music Video', 'preferred_video_codec'));
  assert.equal(preset.defaultMain10, presetBoolean('Music Video', 'default_main10'));
  assert.equal(preset.quality.nvenc, presetValue('Music Video', 'quality_nvenc'));
  assert.equal(preset.encoderSpeed, presetNumber('Music Video', 'encoder_speed'));
  assert.equal(preset.audioCodec, presetValue('Music Video', 'audio_codec'));
  assert.equal(preset.audioRates.opus.stereo, presetValue('Music Video', 'audio_opus_stereo'));
  assert.equal(preset.audioRates.opus.surround, presetValue('Music Video', 'audio_opus_downmix'));
  assert.equal(preset.outputTierDefaults['4k'].resolution?.[0], presetValue('Music Video', 'resolution_4k').split(':')[0]);
  assert.equal(preset.outputTierDefaults['1080p'].resolution?.[1], presetValue('Music Video', 'resolution_1080p').split(':')[1]);
  assert.deepEqual(encoderSpeedArguments('hevc_nvenc', preset.encoderSpeed), ['-preset', `p${preset.encoderSpeed}`]);
  assert.deepEqual(encoderTuneArguments('hevc_nvenc', preset.encoderTune.nvenc), ['-tune', preset.encoderTune.nvenc]);
  assert.equal(preset.advancedVideo.spatialAq, presetNumber('Music Video', 'spatial_aq'));
  assert.equal(preset.advancedVideo.sceneCutDetection, presetBoolean('Music Video', 'scene_cut_detection'));
  assert.equal(advanced.bFrames, presetBoolean('Music Video', 'b_frames'));
  assert.deepEqual(advancedVideoArguments('hevc_nvenc', advanced), [
    '-multipass', String(advanced.multipass), '-bf', '5', '-b_ref_mode', advanced.bRefMode,
    '-b_adapt', String(Number(advanced.adaptiveBFrames)),
    '-no-scenecut', String(Number(!presetBoolean('Music Video', 'scene_cut_detection'))),
    '-rc-lookahead', String(presetNumber('Music Video', 'rc_lookahead')),
    '-nonref_p', String(Number(presetBoolean('Music Video', 'non_reference_p'))),
    '-spatial-aq', '1', '-temporal-aq', String(Number(advanced.temporalAq)),
    '-aq-strength', String(preset.advancedVideo.spatialAq),
  ]);
  assert.equal(preset.bitrateControl, parseBuiltInPresets(presetFile).Streaming.bitrateControl);
});

test('Streaming uses the requested advanced video values and 4K rate override', () => {
  const preset = parseBuiltInPresets(presetFile).Streaming;
  const advanced = resolvePresetAdvancedVideo(preset, 'HEVC');
  assert.equal(advanced.bFrames, presetBoolean('Streaming', 'b_frames'));
  assert.equal(advanced.sceneCutDetection, presetBoolean('Streaming', 'scene_cut_detection'));
  assert.equal(advanced.spatialAq, presetNumber('Streaming', 'spatial_aq'));
  assert.equal(appConfig.videoDefaults.main10Advanced.streamingSpatialAq,
    Number(parseIniSections(configFile).get('Main10 Defaults')?.get('streaming_spatial_aq')));
  assert.equal(preset.outputTierDefaults['4k'].maxRate, presetNumber('Streaming', 'h264_max_rate_4k'));
  assert.equal(preset.defaultMain10, presetBoolean('Streaming', 'default_main10'));
  assert.equal(preset.outputTierDefaults['4k'].quality.nvenc, presetValue('Streaming', 'quality_nvenc_4k'));
});

test('preset job behavior falls back to config.ini and accepts preset-specific values', () => {
  const preset = parseBuiltInPresets(presetFile).Streaming;
  assert.deepEqual(resolvePresetJobBehavior(preset, appConfig.jobBehaviorDefaults), appConfig.jobBehaviorDefaults);
  const override = parseBuiltInPresets(presetFile.replace('[Streaming]', '[Streaming]\nremux_audio=0\nstrip_metadata=1')).Streaming;
  assert.deepEqual(resolvePresetJobBehavior(override, appConfig.jobBehaviorDefaults), {
    ...appConfig.jobBehaviorDefaults, remuxAudio: false, stripMetadata: true,
  });
});

test('blank preset booleans default to unchecked instead of rejecting presets.ini', () => {
  const blankBooleans = presetFile
    .replace(/default_main10=[^\r\n]*/g, 'default_main10=')
    .replace(/remux_audio=[^\r\n]*/g, 'remux_audio=')
    .replace(/remux_subtitles=[^\r\n]*/g, 'remux_subtitles=')
    .replace(/strip_metadata=[^\r\n]*/g, 'strip_metadata=')
    .replace(/do_not_replace_audio=[^\r\n]*/g, 'do_not_replace_audio=')
    .replace(/downmix_to_stereo=[^\r\n]*/g, 'downmix_to_stereo=')
    .replace(/scale_locked=[^\r\n]*/g, 'scale_locked=')
    .replace(/delivery_mode=[^\r\n]*/g, 'delivery_mode=')
    .replace(/bitrate_control=[^\r\n]*/g, 'bitrate_control=')
    .replace(/dynamic_range_compression=[^\r\n]*/g, 'dynamic_range_compression=')
    .replace(/^(b_frames(?:_[^=]+)?|adaptive_b_frames(?:_[^=]+)?|scene_cut_detection(?:_[^=]+)?|non_reference_p(?:_[^=]+)?|temporal_aq(?:_[^=]+)?)=[^\r\n]*/gm, '$1=');
  const presets = parseBuiltInPresets(blankBooleans);
  for (const preset of Object.values(presets)) {
    assert.equal(preset.defaultMain10, false);
    assert.equal(preset.scaleLocked, false);
    assert.equal(preset.deliveryMode, false);
    assert.equal(preset.bitrateControl, false);
    assert.equal(preset.dynamicRangeCompression, false);
    assert.equal(preset.advancedVideo.bFrames, false);
    assert.equal(preset.advancedVideo.adaptiveBFrames, false);
    assert.equal(preset.advancedVideo.sceneCutDetection, false);
    assert.equal(preset.advancedVideo.nonReferenceP, false);
    assert.equal(preset.advancedVideo.temporalAq, false);
    for (const value of Object.values(preset.jobBehavior)) assert.equal(value, false);
    for (const codecSettings of Object.values(preset.advancedVideoCodec)) {
      for (const field of ['bFrames', 'adaptiveBFrames', 'sceneCutDetection', 'nonReferenceP', 'temporalAq'] as const) {
        const value = codecSettings?.[field];
        if (value !== undefined) assert.equal(value, false);
      }
    }
  }
});

test('streaming tiers retain their configured speed and advanced settings', () => {
  const presets = parseBuiltInPresets(presetFile);
  assert.equal(presets.Cellular.encoderSpeed, presets.Streaming.encoderSpeed);
  assert.equal(presets.Cellular.quality.nvenc, presets.Streaming.quality.nvenc);
  for (const name of ['Streaming', 'Cellular', 'Music Video'] as const) {
    assert.equal(presets[name].encoderTune.nvenc, presetValue(name, 'tune_nvenc'));
  }
  assert.equal(presets.Streaming.advancedVideo.spatialAq, presetNumber('Streaming', 'spatial_aq'));
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1').bFrames, presetBoolean('Streaming', 'b_frames_av1'));
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').spatialAq, presetNumber('Streaming', 'spatial_aq_av1'));
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').temporalAq, presetBoolean('Streaming', 'temporal_aq_av1'));
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1').bFrames, presetBoolean('Cellular', 'b_frames_av1'));
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').spatialAq, presetNumber('Cellular', 'spatial_aq_av1'));
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').temporalAq, presetBoolean('Cellular', 'temporal_aq_av1'));
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'HEVC', '360p').spatialAq, presetNumber('Cellular', 'spatial_aq'));
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'HEVC', '360p').temporalAq, presetBoolean('Cellular', 'temporal_aq'));
  assert.equal(presets.Cellular.advancedVideo.spatialAq, parseBuiltInPresets(presetFile).Cellular.advancedVideo.spatialAq);
  assert.equal(presets['Music Video'].advancedVideo.spatialAq, presetNumber('Music Video', 'spatial_aq'));
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'HEVC', '4k').multipass, presetNumber('Streaming', 'multipass_4k'));
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'HEVC', '1080p').multipass, presetNumber('Streaming', 'multipass'));
  assert.equal(resolvePresetAdvancedVideo(presets.Streaming, 'AV1', '720p').multipass, presetNumber('Streaming', 'multipass'));
  assert.equal(resolvePresetAdvancedVideo(presets.Cellular, 'AV1', '360p').multipass, presetNumber('Cellular', 'multipass_360p'));
});

test('preset file contains no obsolete rate, output, tier-quality, or profile settings', () => {
  const presets = parseBuiltInPresets(presetFile);
  assert.doesNotMatch(presetFile, /^\[Output: /m);
  assert.doesNotMatch(presetFile, /^(?:video_bitrate|max_rate(?:_[^=]+)?|buffer_multiplier|bitrate_multiplier_[^=]+|profile_(?:h264|hevc|av1)|encoder_speed_h264_[^=]+)=/m);
  assert.match(presetFile, /^h264_max_rate_(?:4k|1080p)=\d+$/m);
  assert.deepEqual(presets.Streaming.encoderProfile, {});
  assert.deepEqual(presets['Music Video'].encoderProfile, {});
  assert.equal(presets['Music Video'].scaleLocked, presetBoolean('Music Video', 'scale_locked'));
});

test('rejects out-of-range editable preset values', () => {
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace(/\[Version: [^\]]+\]/, '[Version: current]')),
    /must begin with \[Version: <major.minor.patch>\]/,
  );
  assert.throws(
    () => parseBuiltInPresets(setPresetValue(presetFile, 'Streaming', 'rc_lookahead', '43')),
    /rc_lookahead must be an integer from 0 to 42/,
  );
  assert.throws(
    () => parseBuiltInPresets(setPresetValue(presetFile, 'Archive', 'encoder_speed', '8')),
    /encoder_speed must be an integer from 1 to 7/,
  );
  assert.throws(
    () => parseBuiltInPresets(setPresetValue(presetFile, 'Archive', 'dynamic_range_compression', '2')),
    /dynamic_range_compression must be 0 or 1/,
  );
  assert.throws(
    () => parseBuiltInPresets(setPresetValue(presetFile, 'Streaming', 'frame_rate', '0')),
    /frame_rate must be passthrough or a number from 1 to 240/,
  );
  assert.throws(
    () => parseBuiltInPresets(setPresetValue(presetFile, 'Streaming', 'multipass_4k', '3')),
    /multipass_4k must be an integer from 0 to 2/,
  );
  assert.throws(
    () => parseBuiltInPresets(setPresetValue(presetFile, 'Streaming', 'preferred_video_codec_720p', 'VP9')),
    /preferred_video_codec_720p must be one of: H\.264, HEVC, AV1/,
  );
  assert.throws(
    () => parseBuiltInPresets(setPresetValue(presetFile, 'Streaming', 'b_frames_av1', '2')),
    /b_frames_av1 must be 0 or 1/,
  );
});
