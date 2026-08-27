import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { advancedVideoArguments } from './advanced-video-settings.ts';
import { encoderSpeedArguments, encoderTuneArguments } from './encoder-controls.ts';
import { parseBuiltInPresets } from './presets.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');

test('loads ordered built-in preset values from presets.ini', () => {
  const presets = parseBuiltInPresets(presetFile);
  assert.deepEqual(Object.keys(presets), ['Archive', 'Regular', 'Streaming', 'Cellular', 'Music Video']);
  assert.equal(presets.Streaming.audioCodec, 'opus');
  assert.equal(presets.Streaming.audioRates.opus.stereo, '96k');
  assert.equal(presets.Streaming.audioRates.opus.surround, '128k');
  assert.equal(presets.Streaming.encoderSpeed, 2);
  assert.equal(presets.Streaming.encoderTune.nvenc, 'hq');
  assert.equal(presets.Streaming.encoderTune.amf, 'high_quality');
  assert.equal(presets.Streaming.quality.nvenc, '29');
  assert.equal(presets.Regular.quality.nvenc, '24');
  assert.equal(presets.Regular.quality.amf, '22');
  assert.equal(presets.Regular.quality.software, '25');
  assert.deepEqual(presets.Streaming.advancedVideo, {
    bFrames: true, multipass: 2, bRefMode: 'middle', adaptiveBFrames: true,
    sceneCutDetection: true, rcLookahead: 26, nonReferenceP: false, spatialAq: 0, temporalAq: true,
  });
  assert.deepEqual(presets.Cellular.advancedVideo, presets.Streaming.advancedVideo);
  assert.deepEqual(presets['Music Video'].advancedVideo, presets.Streaming.advancedVideo);
});

test('Music Video maps upstream UHQ intent to Jellyfin-compatible AV1 NVENC settings', () => {
  const preset = parseBuiltInPresets(presetFile)['Music Video'];
  assert.equal(preset.preferredVideoCodec, 'AV1');
  assert.equal(preset.quality.nvenc, '24');
  assert.deepEqual(encoderSpeedArguments('av1_nvenc', preset.encoderSpeed), ['-preset', 'p6']);
  assert.deepEqual(encoderTuneArguments('av1_nvenc', preset.encoderTune.nvenc), ['-tune', 'hq']);
  assert.deepEqual(advancedVideoArguments('av1_nvenc', preset.advancedVideo), [
    '-multipass', '2', '-bf', '4', '-b_ref_mode', 'middle', '-b_adapt', '1',
    '-no-scenecut', '0', '-rc-lookahead', '26', '-nonref_p', '0',
    '-spatial-aq', '0', '-temporal-aq', '1',
  ]);
  assert.equal(preset.bitrateControl, true);
  assert.equal(preset.bufferMultiplier, 2);
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
    assert.deepEqual(presets[name].advancedVideo, presets.Streaming.advancedVideo);
  }
});

test('rejects out-of-range editable preset values', () => {
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('rc_lookahead=26', 'rc_lookahead=43')),
    /rc_lookahead must be an integer from 0 to 42/,
  );
});
