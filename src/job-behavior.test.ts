import assert from 'node:assert/strict';
import test from 'node:test';
import { canProcessSurroundAudio, excludedStreamArguments, shouldExtractClosedCaptions } from './job-behavior.ts';

test('output behavior excludes audio and subtitles only when each option is off', () => {
  assert.deepEqual(excludedStreamArguments({ remuxAudio: true, remuxSubtitles: true }), []);
  assert.deepEqual(excludedStreamArguments({ remuxAudio: false, remuxSubtitles: true }), ['-an']);
  assert.deepEqual(excludedStreamArguments({ remuxAudio: true, remuxSubtitles: false }), ['-sn']);
  assert.deepEqual(excludedStreamArguments({ remuxAudio: false, remuxSubtitles: false }), ['-an', '-sn']);
});

test('surround controls require selected surround audio that will be encoded', () => {
  assert.equal(canProcessSurroundAudio(true, true, true), true);
  assert.equal(canProcessSurroundAudio(false, true, true), false);
  assert.equal(canProcessSurroundAudio(true, false, true), false);
  assert.equal(canProcessSurroundAudio(true, true, false), false);
});

test('closed caption extraction requires detection, selection, and enabled subtitle output', () => {
  const eligibility = {
    musicVideo: true, extractionEnabled: true, captionsDetected: true, captionSelected: true,
    subtitleProcessingEnabled: true, subtitlesIncluded: true,
  };
  assert.equal(shouldExtractClosedCaptions(eligibility), true);
  for (const key of Object.keys(eligibility) as (keyof typeof eligibility)[]) {
    assert.equal(shouldExtractClosedCaptions({ ...eligibility, [key]: false }), false, `${key} must gate extraction`);
  }
});
