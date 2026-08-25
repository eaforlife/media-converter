import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEncodeProgress, canFinishEncodeQueue, createEncodeQueueProgress } from './encode-progress-state.ts';
import type { EncodeJob, EncodeProgress } from './shared-types';

const jobs: EncodeJob[] = [1, 2, 3].map((index) => ({
  sourceName: `Source ${index}.mkv`,
  sourcePath: `C:\\input\\source-${index}.mkv`,
  outputPath: `C:\\output\\source-${index}.mp4`,
  duration: 60,
  args: ['-i', `source-${index}.mkv`, `source-${index}.mp4`],
}));

const progress = (phase: EncodeProgress['phase'], jobIndex: number): EncodeProgress => ({
  phase,
  jobIndex,
  totalJobs: jobs.length,
  sourceName: jobs[jobIndex - 1]?.sourceName ?? '',
  outputPath: jobs[jobIndex - 1]?.outputPath ?? '',
  percent: phase === 'completed' ? 100 : 42,
  bitrate: '3200kbits/s',
  fps: '58',
  runTimeSeconds: 12,
  etaSeconds: 18,
  speed: '2x',
});

test('creates a separate pending page for every queued encode', () => {
  const state = createEncodeQueueProgress(jobs);
  assert.equal(state.status, 'running');
  assert.deepEqual(state.jobs.map((job) => job.status), ['pending', 'pending', 'pending']);
  assert.deepEqual(state.jobs.map((job) => job.jobIndex), [1, 2, 3]);
});

test('updates only the job page named by a progress event', () => {
  const initial = createEncodeQueueProgress(jobs);
  const started = applyEncodeProgress(initial, { ...progress('starting', 2), command: ['ffmpeg', '-i', 'source-2.mkv'] });
  const encoded = applyEncodeProgress(started, progress('encoding', 2));
  assert.deepEqual(encoded.jobs.map((job) => job.status), ['pending', 'encoding', 'pending']);
  assert.equal(encoded.jobs[1].percent, 42);
  assert.deepEqual(encoded.jobs[1].command, ['ffmpeg', '-i', 'source-2.mkv']);
});

test('preserves completed pages when the queue finishes', () => {
  let state = createEncodeQueueProgress(jobs);
  state = applyEncodeProgress(state, progress('completed', 1));
  state = applyEncodeProgress(state, progress('completed', 2));
  state = applyEncodeProgress(state, progress('cancelled', 3));
  state = applyEncodeProgress(state, progress('queue-completed', 3));
  assert.equal(state.status, 'completed');
  assert.deepEqual(state.jobs.map((job) => job.status), ['completed', 'completed', 'cancelled']);
});

test('marks unfinished pages when the whole queue is cancelled or fails', () => {
  const active = applyEncodeProgress(createEncodeQueueProgress(jobs), progress('encoding', 1));
  const cancelled = applyEncodeProgress(active, progress('queue-cancelled', 1));
  assert.equal(cancelled.status, 'cancelled');
  assert.deepEqual(cancelled.jobs.map((job) => job.status), ['cancelled', 'cancelled', 'cancelled']);

  const failedJob = applyEncodeProgress(createEncodeQueueProgress(jobs), progress('failed', 1));
  const failed = applyEncodeProgress(failedJob, { ...progress('queue-failed', 1), message: 'FFmpeg failed.' });
  assert.equal(failed.status, 'failed');
  assert.deepEqual(failed.jobs.map((job) => job.status), ['failed', 'skipped', 'skipped']);
});

test('Done is available only after every job has completed or cancelled', () => {
  const running = createEncodeQueueProgress(jobs);
  assert.equal(canFinishEncodeQueue(running), false);
  const failed = applyEncodeProgress(running, progress('queue-failed', 1));
  assert.equal(canFinishEncodeQueue(failed), false);
  const cancelled = applyEncodeProgress(running, progress('queue-cancelled', 1));
  assert.equal(canFinishEncodeQueue(cancelled), true);
  let completed = running;
  for (let index = 1; index <= jobs.length; index += 1) {
    completed = applyEncodeProgress(completed, progress('completed', index));
  }
  completed = applyEncodeProgress(completed, progress('queue-completed', jobs.length));
  assert.equal(canFinishEncodeQueue(completed), true);
});
