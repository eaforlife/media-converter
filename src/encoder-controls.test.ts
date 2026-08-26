import assert from 'node:assert/strict';
import test from 'node:test';
import {
  encoderBackendLabel, encoderSpeedArguments, encoderSpeedDisplay, encoderSpeedLabel, encoderTuneArguments, encoderTuneOptions,
  normalizeEncoderSpeed, normalizeEncoderTune, supportsEncoderSpeed,
} from './encoder-controls.ts';

test('normalizes the seven encoder speed levels', () => {
  assert.equal(normalizeEncoderSpeed(1), 1);
  assert.equal(normalizeEncoderSpeed(7), 7);
  assert.equal(normalizeEncoderSpeed(99), 4);
});

test('formats encoder names and speed values for display', () => {
  assert.equal(encoderBackendLabel('hevc_nvenc'), 'NVIDIA NVENC');
  assert.equal(encoderBackendLabel('av1_amf'), 'AMD AMF');
  assert.equal(encoderBackendLabel('h264_qsv'), 'INTEL QSV');
  assert.equal(encoderBackendLabel('libx265'), 'SOFTWARE ENCODE');
  assert.equal(encoderSpeedDisplay('hevc_nvenc', 1), 'P1');
  assert.equal(encoderSpeedDisplay('libx265', 7), 'P7 / veryslow');
});

test('maps speed levels to each supported encoder family', () => {
  assert.deepEqual(encoderSpeedArguments('hevc_nvenc', 7), ['-preset', 'p7']);
  assert.deepEqual(encoderSpeedArguments('hevc_qsv', 1), ['-preset', 'veryfast']);
  assert.deepEqual(encoderSpeedArguments('hevc_amf', 7), ['-quality', 'quality']);
  assert.deepEqual(encoderSpeedArguments('libx265', 5), ['-preset', 'slow']);
  assert.deepEqual(encoderSpeedArguments('libsvtav1', 1), ['-preset', '13']);
  assert.deepEqual(encoderSpeedArguments('hevc_videotoolbox', 2), ['-prio_speed', '1']);
  assert.equal(encoderSpeedLabel('hevc_qsv', 7), 'veryslow');
  assert.equal(supportsEncoderSpeed('hevc_vaapi'), false);
});

test('only exposes and emits tune values supported by the selected encoder', () => {
  assert.ok(encoderTuneOptions('h264_nvenc').some((option) => option.value === 'ull'));
  assert.deepEqual(encoderTuneArguments('h264_nvenc', 'hq'), ['-tune', 'hq']);
  assert.deepEqual(encoderTuneArguments('hevc_amf', 'lowlatency'), ['-usage', 'lowlatency']);
  assert.deepEqual(encoderTuneArguments('h264_videotoolbox', 'realtime'), ['-realtime', '1']);
  assert.equal(normalizeEncoderTune('hevc_qsv', 'hq'), '');
  assert.deepEqual(encoderTuneArguments('libsvtav1', 'film'), []);
});
