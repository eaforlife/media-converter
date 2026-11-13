import assert from 'node:assert/strict';
import test from 'node:test';
import { isValidCustomPresetName, parseCustomPresets, serializeCustomPresets } from './custom-presets.ts';
import type { SavedPreset } from './shared-types';

const preset: SavedPreset = {
  name: 'Living Room', description: 'Living Room', workflow: 'video', format: 'mp4', encoder: 'hevc_nvenc', resolution: '1920:-2', rateBasis: 'h264',
  encoderSpeed: 6, encoderTune: 'hq', encoderProfile: 'main', frameRate: 25, frameRateOverride: true, quality: '24', videoBitrate: '0', maxRate: '8000',
  bufferMultiplier: 2, bufferSize: '16000', deliveryMode: true,
  advancedVideo: { bFrames: true, multipass: 2, bRefMode: 'middle', adaptiveBFrames: true, sceneCutDetection: true, rcLookahead: 32, nonReferenceP: true, spatialAq: 8, temporalAq: true },
  audioCodec: 'libopus', audioBitrate: '88k',
  audioSettings: '{"0":{"enabled":true}}', subtitleSettings: '{"1":{"enabled":false}}',
  processingSettings: '{"video":true,"audio":true,"subtitles":false}', videoMetadataSettings: '{"language":"eng"}',
  filters: { autoCrop: true, toneMapHdrToSdr: true, pixelFormat10Bit: false, scale: 'auto', scaleLocked: false, remuxAudio: true, remuxSubtitles: true, stripMetadata: true, doNotReplaceAudio: false, extractClosedCaptions: false, downmixToStereo: true, dynamicRangeCompression: true, resampleLosslessTo48k: true, normalizeAudio: true },
};

test('round trips custom presets through integer-based INI values', () => {
  const ini = serializeCustomPresets([preset]);
  assert.match(ini, /delivery_mode=1/);
  assert.match(ini, /dynamic_range_compression=1/);
  assert.match(ini, /remux_audio=1/);
  assert.match(ini, /remux_subtitles=1/);
  assert.doesNotMatch(ini, /=true|=false/);
  assert.deepEqual(parseCustomPresets(ini), [preset]);
});

test('validates INI-safe custom preset names', () => {
  assert.equal(isValidCustomPresetName('Living Room'), true);
  assert.equal(isValidCustomPresetName('bad]name'), false);
  assert.equal(isValidCustomPresetName(''), false);
});

test('older custom presets default to frame-rate passthrough and invalid rates are rejected', () => {
  const ini = serializeCustomPresets([preset]);
  assert.equal(parseCustomPresets(ini.replace(`frame_rate=${preset.frameRate}\n`, ''))[0].frameRate, 'passthrough');
  assert.throws(
    () => parseCustomPresets(ini.replace(`frame_rate=${preset.frameRate}`, 'frame_rate=0')),
    /frame_rate must be passthrough or a number from 1 to 240/,
  );
});

test('older custom presets inherit missing job behavior from config defaults', () => {
  const defaults = { remuxAudio: false, remuxSubtitles: false, stripMetadata: false, doNotReplaceAudio: true, downmixToStereo: false };
  const ini = serializeCustomPresets([preset]).replace(/(?:remux_(?:audio|subtitles)|downmix_to_stereo)=\d+\n/g, '');
  assert.equal(parseCustomPresets(ini, defaults)[0].filters.remuxAudio, false);
  assert.equal(parseCustomPresets(ini, defaults)[0].filters.remuxSubtitles, false);
  assert.equal(parseCustomPresets(ini, defaults)[0].filters.downmixToStereo, false);
});
