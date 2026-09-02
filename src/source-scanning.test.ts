import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIO_INSPECTION_LIMIT, boundedMap, inspectionConcurrency } from './source-scanning.ts';

test('uses higher bounded inspection concurrency for audio libraries', () => {
  assert.equal(inspectionConcurrency(7_000, true, 16), AUDIO_INSPECTION_LIMIT);
  assert.equal(inspectionConcurrency(7_000, true, 8), 8);
  assert.equal(inspectionConcurrency(3, true, 16), 3);
  assert.equal(inspectionConcurrency(100, false, 16), 2);
  assert.equal(inspectionConcurrency(0, true, 16), 0);
});

test('bounded mapping preserves source order and reports every completion', async () => {
  let active = 0;
  let maximumActive = 0;
  const progress: number[] = [];
  const result = await boundedMap(
    [4, 3, 2, 1],
    2,
    async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise((resolve) => setTimeout(resolve, value));
      active -= 1;
      return value * 2;
    },
    (completed) => progress.push(completed),
  );
  assert.deepEqual(result, [8, 6, 4, 2]);
  assert.equal(maximumActive, 2);
  assert.deepEqual(progress, [1, 2, 3, 4]);
});
