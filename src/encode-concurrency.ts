import type { EncodeJob } from './shared-types';

export const ADAPTIVE_SAMPLE_MS = 10_000;
export const MINIMUM_JOB_FPS = 200;
export const NVENC_SESSION_LIMIT = 12;

export const isNvencJob = (job: EncodeJob) => job.args.some((argument, index) =>
  argument === '-c:v' && job.args[index + 1]?.endsWith('_nvenc'));

export const encoderConcurrencyLimit = (jobs: readonly EncodeJob[]) =>
  jobs.length > 1 && jobs.every(isNvencJob)
    ? Math.min(jobs.length, NVENC_SESSION_LIMIT)
    : 1;

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

export const canAddEncodeJob = (aggregateFps: number | null, activeJobs: number, limit: number) => {
  if (aggregateFps === null || activeJobs >= limit) return false;
  const requiredFps = MINIMUM_JOB_FPS * (activeJobs + 1);
  return aggregateFps >= requiredFps;
};
