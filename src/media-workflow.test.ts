import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachedCoverArtArguments, classifyMediaWorkflow, isH264HighSource, musicVideoEncoderProfile,
  frameRateConversionArguments, outputEncoderProfile, shouldDefaultToHevcMain10,
} from './media-workflow.ts';
import type { MediaInfo } from './shared-types.ts';

const media = (overrides: Partial<MediaInfo>): MediaInfo => ({
  format: 'matroska', duration: 300, video: null, audio: [], subtitles: [], chapterCount: 0,
  suggestedCrop: null, hasCoverArt: false, coverArtStreamIndexes: [], ...overrides,
});

const video = {
  index: 1, language: 'und', languageLabel: 'Undefined',
  flags: { default: true, forced: false, hearingImpaired: false }, codec: 'HEVC', profile: 'Main',
  pixelFormat: 'yuv420p', isHevcMain10: false, width: 3840, height: 2160, frameRate: '30 fps',
  hasHdr: false, hdrFormat: null, hasDolbyVision: false,
};

test('short video with attached cover art selects the music-video workflow', () => {
  assert.equal(classifyMediaWorkflow(media({ video, hasCoverArt: true, duration: 479 })), 'music-video');
  assert.equal(classifyMediaWorkflow(media({ video, hasCoverArt: true, duration: 480 })), 'video');
  assert.equal(classifyMediaWorkflow(media({ video, hasCoverArt: false, duration: 200 })), 'video');
});

test('audio-only input selects the audio workflow', () => {
  assert.equal(classifyMediaWorkflow(media({ audio: [{} as MediaInfo['audio'][number]] })), 'audio');
});

test('music-video cover art is copied after the encoded primary video stream', () => {
  assert.deepEqual(attachedCoverArtArguments([4, 7]), [
    '-map', '0:4', '-c:v:1', 'copy', '-disposition:v:1', 'attached_pic',
    '-map', '0:7', '-c:v:2', 'copy', '-disposition:v:2', 'attached_pic',
  ]);
});

test('music-video output profiles map HEVC to Main10 and leave other codecs unset', () => {
  assert.equal(isH264HighSource({ ...video, codec: 'H264', profile: 'High' }), true);
  assert.equal(isH264HighSource({ ...video, codec: 'HEVC', profile: 'Main 10' }), false);
  assert.equal(musicVideoEncoderProfile('HEVC', true), 'main10');
  assert.equal(musicVideoEncoderProfile('HEVC', false), null);
  assert.equal(musicVideoEncoderProfile('H.264', false), null);
  assert.equal(musicVideoEncoderProfile('AV1', true), null);
});

test('streaming HEVC defaults to Main or Main10 from the source characteristics', () => {
  assert.equal(shouldDefaultToHevcMain10(video), false);
  assert.equal(shouldDefaultToHevcMain10({ ...video, isHevcMain10: true }), true);
  assert.equal(shouldDefaultToHevcMain10({ ...video, hasHdr: true }), true);
  assert.equal(shouldDefaultToHevcMain10({ ...video, hasDolbyVision: true }), true);
  assert.equal(outputEncoderProfile('HEVC', 'main', false), 'main');
  assert.equal(outputEncoderProfile('HEVC', 'main', true), 'main10');
  assert.equal(outputEncoderProfile('H.264', 'high', false), 'high');
  assert.equal(outputEncoderProfile('H.264', '', false), null);
});

test('configured frame rate only converts faster sources and uses exact NTSC film timing', () => {
  assert.deepEqual(frameRateConversionArguments('29.97 fps', 23.976), [
    '-fps_mode:v:0', 'cfr', '-r:v:0', '24000/1001',
  ]);
  assert.deepEqual(frameRateConversionArguments('60 fps', 23.976), [
    '-fps_mode:v:0', 'cfr', '-r:v:0', '24000/1001',
  ]);
  assert.deepEqual(frameRateConversionArguments('23.976 fps', 23.976), []);
  assert.deepEqual(frameRateConversionArguments('24 fps', 23.976), []);
  assert.deepEqual(frameRateConversionArguments('29.97 fps', 'passthrough'), []);
  assert.deepEqual(frameRateConversionArguments('Unknown', 23.976), []);
});
