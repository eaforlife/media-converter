import assert from 'node:assert/strict';
import test from 'node:test';
import {
  averageAggregateFps,
  canAddEncodeJob,
  encoderConcurrencyLimit,
  NVENC_SESSION_LIMIT,
} from './encode-concurrency.ts';
import type { EncodeJob } from './shared-types.ts';

const job = (encoder: string): EncodeJob => ({
  sourcePath: 'C:\\source.mkv', sourceName: 'source.mkv', outputPath: 'C:\\output.mp4',
  args: ['-i', 'C:\\source.mkv', '-c:v', encoder, 'C:\\output.mp4'], duration: 60,
});

test('adaptive concurrency is limited to supported NVENC sessions', () => {
  assert.equal(encoderConcurrencyLimit(Array.from({ length: 20 }, () => job('hevc_nvenc'))), NVENC_SESSION_LIMIT);
  assert.equal(encoderConcurrencyLimit([job('hevc_nvenc'), job('libx265')]), 1);
  assert.equal(encoderConcurrencyLimit([job('h264_qsv'), job('h264_qsv')]), 1);
});

test('the ten-second sample uses each active encode average', () => {
  assert.equal(averageAggregateFps([[700, 720], [195, 205]]), 910);
  assert.equal(averageAggregateFps([[], [0, Number.NaN]]), null);
});

test('a second encode requires 400 fps and 710 fps grows to three jobs', () => {
  assert.equal(canAddEncodeJob(290, 1, 12), false);
  assert.equal(canAddEncodeJob(400, 1, 12), true);
  assert.equal(canAddEncodeJob(710, 1, 12), true);
  assert.equal(canAddEncodeJob(710, 2, 12), true);
  assert.equal(canAddEncodeJob(710, 3, 12), false);
  assert.equal(canAddEncodeJob(710, 4, 12), false);
});
