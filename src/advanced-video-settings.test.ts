import assert from 'node:assert/strict';
import test from 'node:test';
import { advancedVideoArguments, supportedAdvancedVideoFields } from './advanced-video-settings.ts';
import type { AdvancedVideoSettings } from './shared-types.ts';

const settings: AdvancedVideoSettings = {
  bFrames: true, multipass: 2, bRefMode: 'middle', adaptiveBFrames: true,
  sceneCutDetection: true, rcLookahead: 27, nonReferenceP: true, spatialAq: 10, temporalAq: true,
};

test('maps every requested advanced setting to NVENC options', () => {
  assert.deepEqual(advancedVideoArguments('hevc_nvenc', settings), [
    '-multipass', '2', '-bf', '5', '-b_ref_mode', 'middle', '-b_adapt', '1',
    '-no-scenecut', '0', '-rc-lookahead', '27', '-nonref_p', '1',
    '-spatial-aq', '1', '-temporal-aq', '1', '-aq-strength', '10',
  ]);
  assert.equal(advancedVideoArguments('h264_nvenc', settings)[3], '4');
});

test('maps only supported semantic settings to QSV options', () => {
  assert.deepEqual(supportedAdvancedVideoFields('hevc_qsv'), [
    'bFrames', 'adaptiveBFrames', 'sceneCutDetection', 'rcLookahead',
  ]);
  assert.deepEqual(advancedVideoArguments('hevc_qsv', settings), [
    '-bf', '4', '-adaptive_b', '1', '-adaptive_i', '1',
    '-look_ahead_depth', '27',
  ]);
});

test('maps AMF pre-analysis controls without exposing CUDA-only fields', () => {
  assert.deepEqual(supportedAdvancedVideoFields('h264_amf'), [
    'adaptiveBFrames', 'sceneCutDetection', 'rcLookahead', 'spatialAq', 'temporalAq',
  ]);
  assert.deepEqual(supportedAdvancedVideoFields('hevc_amf'), [
    'sceneCutDetection', 'rcLookahead', 'spatialAq', 'temporalAq',
  ]);
  assert.deepEqual(supportedAdvancedVideoFields('hevc_vaapi'), []);
  assert.deepEqual(advancedVideoArguments('hevc_amf', settings), [
    '-preanalysis', '1', '-pa_scene_change_detection_enable', '1',
    '-pa_lookahead_buffer_depth', '27', '-pa_paq_mode', 'caq', '-pa_caq_strength', 'medium',
    '-pa_taq_mode', '1',
  ]);
});

test('uses software encoder-specific option names', () => {
  assert.deepEqual(supportedAdvancedVideoFields('libsvtav1'), []);
  assert.deepEqual(advancedVideoArguments('libsvtav1', settings), []);
  assert.deepEqual(advancedVideoArguments('libx265', settings), [
    '-x265-params', 'bframes=4:b-pyramid=1:b-adapt=1:scenecut=40:rc-lookahead=27:aq-mode=2:aq-strength=2.0',
  ]);
});
