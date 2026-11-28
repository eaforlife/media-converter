import assert from 'node:assert/strict';
import test from 'node:test';
import { applyEncodeProgress, canFinishEncodeQueue, createEncodeQueueProgress, estimateEncodePercent, nextEncodeBitrateLabel, rollingBitrateLabel } from './encode-progress-state.ts';
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

test('appends warning and error diagnostics to the live process output for that job', () => {
  let state = createEncodeQueueProgress(jobs);
  state = applyEncodeProgress(state, {
    ...progress('starting', 1),
    liveOutput: { kind: 'message', level: 'INFO', message: 'CCExtractor started.' },
  });
  state = applyEncodeProgress(state, {
    ...progress('starting', 1),
    liveOutput: { kind: 'message', level: 'WARN', message: 'CCExtractor exited with code 2.' },
  });
  state = applyEncodeProgress(state, {
    ...progress('starting', 1), command: ['ffmpeg', '-i', 'source-1.mkv'],
  });
  state = applyEncodeProgress(state, {
    ...progress('starting', 1),
    liveOutput: { kind: 'message', level: 'ERROR', message: 'FFmpeg failed.' },
  });
  assert.deepEqual(state.jobs[0].liveOutput, [
    { kind: 'message', level: 'INFO', message: 'CCExtractor started.' },
    { kind: 'message', level: 'WARN', message: 'CCExtractor exited with code 2.' },
    { kind: 'command', command: ['ffmpeg', '-i', 'source-1.mkv'] },
    { kind: 'message', level: 'ERROR', message: 'FFmpeg failed.' },
  ]);
  assert.deepEqual(state.jobs[1].liveOutput, []);
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

test('reports rolling bitrate from consecutive FFmpeg size and timestamp samples', () => {
  assert.equal(
    rollingBitrateLabel({ bytes: 1_000_000, seconds: 2 }, { bytes: 2_000_000, seconds: 4 }),
    '4000kbits/s',
  );
  assert.equal(rollingBitrateLabel({ bytes: 10, seconds: 2 }, { bytes: 9, seconds: 4 }), null);
  assert.equal(rollingBitrateLabel({ bytes: 10, seconds: 2 }, { bytes: 20, seconds: 2 }), null);
});

test('estimates encode progress from frame counts when FFmpeg omits timestamps', () => {
  assert.equal(estimateEncodePercent({
    encodedSeconds: 0, durationSeconds: 100, frame: 600, expectedFrames: 2400,
    fps: 48, elapsedSeconds: 20, previousPercent: null,
  }), 25);
});

test('falls back to elapsed time and current FPS when FFmpeg omits frame and time fields', () => {
  assert.equal(estimateEncodePercent({
    encodedSeconds: 0, durationSeconds: 100, frame: Number.NaN, expectedFrames: 2400,
    fps: 48, elapsedSeconds: 20, previousPercent: null,
  }), 40);
});

test('keeps estimated progress monotonic and below completion until FFmpeg exits', () => {
  assert.equal(estimateEncodePercent({
    encodedSeconds: 10, durationSeconds: 100, frame: 1200, expectedFrames: 2400,
    fps: 24, elapsedSeconds: 50, previousPercent: 60,
  }), 60);
  assert.equal(estimateEncodePercent({
    encodedSeconds: 100, durationSeconds: 100, frame: 2400, expectedFrames: 2400,
    fps: 24, elapsedSeconds: 100, previousPercent: null,
  }), 99.9);
});

test('retains the last bitrate label when FFmpeg intermittently omits it and refreshes from size samples', () => {
  const reported = nextEncodeBitrateLabel(null, '1600kbits/s', null);
  assert.equal(reported, '1600kbits/s');
  const recalculated = nextEncodeBitrateLabel(reported, undefined, '1820kbits/s');
  assert.equal(recalculated, '1820kbits/s');
  assert.equal(nextEncodeBitrateLabel(recalculated, undefined, null), '1820kbits/s');
});
