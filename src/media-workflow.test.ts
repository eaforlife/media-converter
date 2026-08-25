import assert from 'node:assert/strict';
import test from 'node:test';
import {
  attachedCoverArtArguments, classifyMediaWorkflow, isH264HighSource, musicVideoEncoderProfile,
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

test('music-video output profiles map HEVC to Main10, H.264 to High, and leave AV1 unset', () => {
  assert.equal(isH264HighSource({ ...video, codec: 'H264', profile: 'High' }), true);
  assert.equal(isH264HighSource({ ...video, codec: 'HEVC', profile: 'Main 10' }), false);
  assert.equal(musicVideoEncoderProfile('HEVC', true), 'main10');
  assert.equal(musicVideoEncoderProfile('HEVC', false), null);
  assert.equal(musicVideoEncoderProfile('H.264', false), 'high');
  assert.equal(musicVideoEncoderProfile('AV1', true), null);
});
