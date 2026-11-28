import assert from 'node:assert/strict';
import test from 'node:test';
import { AUDIO_INSPECTION_LIMIT, boundedMap, createSerialTaskQueue, inspectionConcurrency } from './source-scanning.ts';

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

test('serial task queues never overlap work and continue after a task fails', async () => {
  const schedule = createSerialTaskQueue();
  let active = 0;
  let maxActive = 0;
  const run = (value: number) => schedule(async () => {
    active += 1;
    maxActive = Math.max(maxActive, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
    return value;
  });
  const first = run(1);
  const failed = schedule(async () => { throw new Error('expected failure'); });
  const last = run(3);
  assert.deepEqual(await Promise.all([first, failed.catch(() => 2), last]), [1, 2, 3]);
  assert.equal(maxActive, 1);
});
