import assert from 'node:assert/strict';
import test from 'node:test';
import {
  averageAggregateFps,
  AUDIO_ENCODE_LIMIT,
  cancelAdaptiveQueueActivity,
  canAddEncodeJob,
  encodeConcurrencyPlan,
  encoderConcurrencyLimit,
  forceCloseOwnedProcesses,
  initialThroughputConcurrencyLimit,
  lockThroughputConcurrencyLimit,
  NVENC_SESSION_LIMIT,
} from './encode-concurrency.ts';
import type { EncodeJob } from './shared-types.ts';

const job = (encoder: string): EncodeJob => ({
  sourcePath: 'C:\\source.mkv', sourceName: 'source.mkv', outputPath: 'C:\\output.mp4',
  args: ['-i', 'C:\\source.mkv', '-c:v', encoder, 'C:\\output.mp4'], duration: 60,
});

test('cancel all interrupts every adaptive wait and active encode', () => {
  let cancelledWaits = 0;
  let killedProcesses = 0;
  cancelAdaptiveQueueActivity(
    [() => { cancelledWaits += 1; }, () => { cancelledWaits += 1; }],
    [{ kill: () => { killedProcesses += 1; } }, { kill: () => { killedProcesses += 1; } }],
  );
  assert.equal(cancelledWaits, 2);
  assert.equal(killedProcesses, 2);
});

test('queue cleanup force-closes only the child processes owned by the app', () => {
  const signals: Array<string | number | undefined> = [];
  const owned = [
    { exitCode: null, signalCode: null, kill: (signal?: string | number) => { signals.push(signal); return true; } },
    { exitCode: 0, signalCode: null, kill: (signal?: string | number) => { signals.push(signal); return true; } },
  ];
  let unrelatedKills = 0;
  const unrelated = { exitCode: null, signalCode: null, kill: () => { unrelatedKills += 1; return true; } };
  assert.equal(forceCloseOwnedProcesses(owned), 1);
  assert.deepEqual(signals, ['SIGKILL']);
  assert.equal(unrelatedKills, 0);
  assert.equal(unrelated.exitCode, null);
});

test('adaptive concurrency is limited to supported NVENC sessions', () => {
  assert.equal(encoderConcurrencyLimit(Array.from({ length: 20 }, () => job('hevc_nvenc'))), NVENC_SESSION_LIMIT);
  assert.equal(encoderConcurrencyLimit([job('hevc_nvenc'), job('libx265')]), 1);
  assert.equal(encoderConcurrencyLimit([job('h264_qsv'), job('h264_qsv')]), 1);
});

test('simultaneous encoding runs audio batches at a fixed safe limit and can be disabled', () => {
  const audioJobs = Array.from({ length: 20 }, (_, index): EncodeJob => ({
    ...job('libopus'), workflow: 'audio', sourceName: `track-${index}.flac`, args: ['-c:a', 'libopus'],
  }));
  assert.deepEqual(encodeConcurrencyPlan(audioJobs, true), { limit: AUDIO_ENCODE_LIMIT, adaptive: false });
  assert.deepEqual(encodeConcurrencyPlan(audioJobs.slice(0, 2), true), { limit: 2, adaptive: false });
  assert.deepEqual(encodeConcurrencyPlan(audioJobs, false), { limit: 1, adaptive: false });
  assert.equal(encoderConcurrencyLimit(Array.from({ length: 20 }, () => job('hevc_nvenc')), false), 1);
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

test('the first single-encode average permanently caps batch concurrency', () => {
  assert.equal(initialThroughputConcurrencyLimit(290, 12), 1);
  assert.equal(initialThroughputConcurrencyLimit(710, 12), 3);
  assert.equal(initialThroughputConcurrencyLimit(900, 12), 4);
  const fixedLimit = initialThroughputConcurrencyLimit(900, 12);
  assert.equal(canAddEncodeJob(1_600, 4, fixedLimit), false);
  assert.equal(lockThroughputConcurrencyLimit(null, 900, 12), 4);
  assert.equal(lockThroughputConcurrencyLimit(4, 1_600, 12), 4);
});
