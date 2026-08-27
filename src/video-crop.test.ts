import assert from 'node:assert/strict';
import test from 'node:test';
import { aspectPreservingDimensions, detectedCrop } from './video-crop.ts';

test('accepts black-bar crops that begin at the top-left edge', () => {
  assert.ok(detectedCrop('1920:800:0:0', 1920, 1080));
});

test('derives an even scaled height from the cropped display aspect ratio', () => {
  const crop = detectedCrop('1920:800:0:140', 1920, 1080);
  assert.ok(crop);
  assert.deepEqual(aspectPreservingDimensions(['1760', '-2'], 1920, 1080, crop), ['1760', '734']);
  assert.deepEqual(aspectPreservingDimensions(['1760', '-2'], 1920, 1080), ['1760', '990']);
});
