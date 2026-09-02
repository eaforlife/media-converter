import type { EncodeJob, EncodeProgress } from './shared-types';

export type EncodeJobStatus =
  | 'pending'
  | 'starting'
  | 'encoding'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'skipped';

export type EncodeJobProgressState = {
  jobIndex: number;
  sourceName: string;
  outputPath: string;
  status: EncodeJobStatus;
  percent: number | null;
  bitrate: string;
  fps: string;
  runTimeSeconds: number;
  etaSeconds: number | null;
  speed: string;
  command?: string[];
  message?: string;
};

export type EncodeQueueStatus = 'running' | 'completed' | 'failed' | 'cancelled';

export type EncodeQueueProgressState = {
  jobs: EncodeJobProgressState[];
  status: EncodeQueueStatus;
  message?: string;
};

const EMPTY_STAT = '—';

export type EncodeSizeSample = { bytes: number; seconds: number };

export const rollingBitrateLabel = (previous: EncodeSizeSample, current: EncodeSizeSample) => {
  const elapsedSeconds = current.seconds - previous.seconds;
  const encodedBytes = current.bytes - previous.bytes;
  if (!Number.isFinite(elapsedSeconds) || !Number.isFinite(encodedBytes) || elapsedSeconds <= 0 || encodedBytes < 0) {
    return null;
  }
  const kilobitsPerSecond = (encodedBytes * 8) / elapsedSeconds / 1000;
  return `${kilobitsPerSecond >= 100 ? kilobitsPerSecond.toFixed(0) : kilobitsPerSecond.toFixed(1)}kbits/s`;
};

export const createEncodeQueueProgress = (jobs: EncodeJob[]): EncodeQueueProgressState => ({
  status: 'running',
  jobs: jobs.map((job, index) => ({
    jobIndex: index + 1,
    sourceName: job.sourceName,
    outputPath: job.replaceSourcePath ?? job.outputPath,
    status: 'pending',
    percent: null,
    bitrate: EMPTY_STAT,
    fps: EMPTY_STAT,
    runTimeSeconds: 0,
    etaSeconds: null,
    speed: EMPTY_STAT,
  })),
});

const terminalQueueStatus = (phase: EncodeProgress['phase']): EncodeQueueStatus | null => {
  if (phase === 'queue-completed') return 'completed';
  if (phase === 'queue-failed') return 'failed';
  if (phase === 'queue-cancelled') return 'cancelled';
  return null;
};

const jobStatus = (phase: EncodeProgress['phase']): EncodeJobStatus | null => {
  if (phase === 'starting' || phase === 'encoding' || phase === 'completed' || phase === 'failed' || phase === 'cancelled') {
    return phase;
  }
  return null;
};

export const applyEncodeProgress = (
  state: EncodeQueueProgressState,
  progress: EncodeProgress,
): EncodeQueueProgressState => {
  const queueStatus = terminalQueueStatus(progress.phase);
  if (queueStatus) {
    const unfinishedStatus: EncodeJobStatus = queueStatus === 'cancelled' ? 'cancelled' : 'skipped';
    return {
      status: queueStatus,
      message: progress.message,
      jobs: state.jobs.map((job) => (
        job.status === 'pending' || job.status === 'starting' || job.status === 'encoding'
          ? { ...job, status: unfinishedStatus, message: progress.message }
          : job
      )),
    };
  }

  const status = jobStatus(progress.phase);
  if (!status) return state;
  return {
    ...state,
    jobs: state.jobs.map((job) => job.jobIndex === progress.jobIndex ? {
      ...job,
      sourceName: progress.sourceName,
      outputPath: progress.outputPath,
      status,
      percent: progress.percent,
      bitrate: progress.bitrate,
      fps: progress.fps,
      runTimeSeconds: progress.runTimeSeconds,
      etaSeconds: progress.etaSeconds,
      speed: progress.speed,
      command: progress.command ?? job.command,
      message: progress.message,
    } : job),
  };
};

export const isQueueTerminal = (state: EncodeQueueProgressState) => state.status !== 'running';

export const canFinishEncodeQueue = (state: EncodeQueueProgressState) =>
  isQueueTerminal(state)
  && state.jobs.every((job) => job.status === 'completed' || job.status === 'cancelled');
