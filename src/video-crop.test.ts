import assert from 'node:assert/strict';
import test from 'node:test';
import { aspectPreservingDimensions, cropAnalysisDimensions, cropSampleTimes, cuvidCropMargins, detectedCrop, scaleCropFromAnalysis, stableCropConsensus } from './video-crop.ts';

test('accepts black-bar crops that begin at the top-left edge', () => {
  assert.ok(detectedCrop('1920:800:0:0', 1920, 1080));
});

test('derives an even scaled height from the cropped display aspect ratio', () => {
  const crop = detectedCrop('1920:800:0:140', 1920, 1080);
  assert.ok(crop);
  assert.deepEqual(aspectPreservingDimensions(['1760', '-2'], 1920, 1080, crop), ['1760', '734']);
  assert.deepEqual(aspectPreservingDimensions(['1760', '-2'], 1920, 1080), ['1760', '990']);
});

test('converts detected crop dimensions to CUVID decoder margins', () => {
  const crop = detectedCrop('1920:800:0:140', 1920, 1080);
  assert.ok(crop);
  assert.equal(cuvidCropMargins(crop, 1920, 1080), '70x70x0x0');
});

test('rounds asymmetric detected crops to CUVID decoder half margins', () => {
  const crop = detectedCrop('1888:1041:17:19', 1920, 1080);
  assert.ok(crop);
  assert.equal(cuvidCropMargins(crop, 1920, 1080), '10x10x9x8');
});

test('uses the crop shared by most sampled scene windows', () => {
  assert.equal(stableCropConsensus([
    '1920:800:0:140', '1920:800:0:140', '1920:800:0:140',
    '1920:1080:0:0', '1888:1040:16:20',
  ], 1920, 1080), '1920:800:0:140');
});

test('rejects a crop found only in a minority scene window', () => {
  assert.equal(stableCropConsensus([
    '1920:800:0:140', '1920:1080:0:0', '1920:1080:0:0',
    '1920:1080:0:0', '1888:1040:16:20',
  ], 1920, 1080), null);
});

test('maps a low-resolution analysis crop back to the source dimensions', () => {
  assert.deepEqual(cropAnalysisDimensions(1920, 1080), [320, 180]);
  assert.deepEqual(cropAnalysisDimensions(640, 480), [320, 240]);
  assert.equal(scaleCropFromAnalysis('320:134:0:23', 1920, 1080, 320, 180), '1920:804:0:138');
});

test('places two crop samples at 30 and 70 percent of the source', () => {
  assert.deepEqual(cropSampleTimes(100, 2), [30, 70]);
  assert.deepEqual(cropSampleTimes(100, 1), [50]);
});

test('requires both crop samples to agree when only two samples are configured', () => {
  assert.equal(stableCropConsensus([
    '1920:800:0:140', '1920:1080:0:0',
  ], 1920, 1080), null);
  assert.equal(stableCropConsensus([
    '1920:800:0:140', '1920:800:0:140',
  ], 1920, 1080), '1920:800:0:140');
});
