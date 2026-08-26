import assert from 'node:assert/strict';
import test from 'node:test';
import { aspectPreservingDimensions, cuvidCrop, detectedCrop, qsvCropOptions } from './video-crop.ts';

test('converts cropdetect geometry to CUVID pixel-edge offsets', () => {
  const crop = detectedCrop('1920:800:0:140', 1920, 1080);
  assert.ok(crop);
  assert.equal(cuvidCrop(crop, 1920, 1080), '140x140x0x0');
});

test('converts cropdetect geometry to native QSV crop options', () => {
  const crop = detectedCrop('1880:1000:20:40', 1920, 1080);
  assert.ok(crop);
  assert.deepEqual(qsvCropOptions(crop), ['cw=1880', 'ch=1000', 'cx=20', 'cy=40']);
});

test('derives an even scaled height from the cropped display aspect ratio', () => {
  const crop = detectedCrop('1920:800:0:140', 1920, 1080);
  assert.ok(crop);
  assert.deepEqual(aspectPreservingDimensions(['1760', '-2'], 1920, 1080, crop), ['1760', '734']);
  assert.deepEqual(aspectPreservingDimensions(['1760', '-2'], 1920, 1080), ['1760', '990']);
});
