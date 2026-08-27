import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseBuiltInPresets } from './presets.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');

test('loads ordered built-in preset values from presets.ini', () => {
  const presets = parseBuiltInPresets(presetFile);
  assert.deepEqual(Object.keys(presets), ['Archive', 'Regular', 'Streaming', 'Cellular']);
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
});

test('rejects out-of-range editable preset values', () => {
  assert.throws(
    () => parseBuiltInPresets(presetFile.replace('rc_lookahead=26', 'rc_lookahead=43')),
    /rc_lookahead must be an integer from 0 to 42/,
  );
});
