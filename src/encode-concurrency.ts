import type { EncodeJob } from './shared-types';

type KillableProcess = { kill: () => unknown };
type OwnedProcess = { exitCode: number | null; signalCode: NodeJS.Signals | null; kill: (signal?: NodeJS.Signals | number) => unknown };

export const ADAPTIVE_SAMPLE_MS = 10_000;
export const MINIMUM_JOB_FPS = 200;
export const NVENC_SESSION_LIMIT = 12;
export const AUDIO_ENCODE_LIMIT = 4;

export const isNvencJob = (job: EncodeJob) => job.args.some((argument, index) =>
  argument === '-c:v' && job.args[index + 1]?.endsWith('_nvenc'));

export const encodeConcurrencyPlan = (
  jobs: readonly EncodeJob[],
  simultaneousEncoding = true,
): { limit: number; adaptive: boolean } => {
  if (!simultaneousEncoding || jobs.length <= 1) return { limit: 1, adaptive: false };
  if (jobs.every(isNvencJob)) {
    return { limit: Math.min(jobs.length, NVENC_SESSION_LIMIT), adaptive: true };
  }
  if (jobs.every((job) => job.workflow === 'audio')) {
    return { limit: Math.min(jobs.length, AUDIO_ENCODE_LIMIT), adaptive: false };
  }
  return { limit: 1, adaptive: false };
};

export const encoderConcurrencyLimit = (jobs: readonly EncodeJob[], simultaneousEncoding = true) =>
  encodeConcurrencyPlan(jobs, simultaneousEncoding).limit;

export const averageAggregateFps = (windows: Iterable<readonly number[]>) => {
  let total = 0;
  let measuredJobs = 0;
  for (const samples of windows) {
    const valid = samples.filter((sample) => Number.isFinite(sample) && sample > 0);
    if (!valid.length) continue;
    total += valid.reduce((sum, sample) => sum + sample, 0) / valid.length;
    measuredJobs += 1;
  }
  return measuredJobs ? total : null;
};

export const initialThroughputConcurrencyLimit = (averageFps: number, encoderLimit: number) => {
  if (!Number.isFinite(averageFps) || averageFps <= 0) return 1;
  return Math.max(1, Math.min(encoderLimit, Math.floor(averageFps / MINIMUM_JOB_FPS)));
};

export const lockThroughputConcurrencyLimit = (
  currentLimit: number | null,
  firstAverageFps: number | null,
  encoderLimit: number,
) => currentLimit ?? (firstAverageFps === null
  ? null
  : initialThroughputConcurrencyLimit(firstAverageFps, encoderLimit));

export const cancelAdaptiveQueueActivity = (
  pendingWaits: Iterable<() => void>,
  activeProcesses: Iterable<KillableProcess>,
) => {
  for (const cancel of [...pendingWaits]) cancel();
  for (const process of activeProcesses) process.kill();
};

export const forceCloseOwnedProcesses = (ownedProcesses: Iterable<OwnedProcess>) => {
  let killed = 0;
  for (const process of [...ownedProcesses]) {
    if (process.exitCode !== null || process.signalCode !== null) continue;
    if (process.kill('SIGKILL')) killed += 1;
  }
  return killed;
};

export const canAddEncodeJob = (aggregateFps: number | null, activeJobs: number, limit: number) => {
  if (aggregateFps === null || activeJobs >= limit) return false;
  const requiredFps = MINIMUM_JOB_FPS * (activeJobs + 1);
  return aggregateFps >= requiredFps;
};
