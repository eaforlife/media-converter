import type { EncodeJob, EncodeLiveOutputEntry, EncodeProgress } from './shared-types';

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
  liveOutput: EncodeLiveOutputEntry[];
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

export const nextEncodeBitrateLabel = (
  previous: string | null,
  reported: string | undefined,
  measured: string | null,
) => reported && reported !== 'N/A' ? reported : measured ?? previous;

export const estimateEncodePercent = (input: {
  encodedSeconds: number;
  durationSeconds: number | null;
  frame: number;
  expectedFrames: number | null | undefined;
  fps: number;
  elapsedSeconds: number;
  previousPercent: number | null;
}) => {
  const { encodedSeconds, durationSeconds, frame, expectedFrames, fps, elapsedSeconds, previousPercent } = input;
  const timePercent = durationSeconds && durationSeconds > 0 && encodedSeconds > 0
    ? encodedSeconds / durationSeconds * 100
    : null;
  const framePercent = expectedFrames && expectedFrames > 0 && frame >= 0
    ? frame / expectedFrames * 100
    : null;
  const fpsPercent = expectedFrames && expectedFrames > 0 && fps > 0 && elapsedSeconds > 0
    ? fps * elapsedSeconds / expectedFrames * 100
    : null;
  const estimate = timePercent ?? framePercent ?? fpsPercent;
  if (estimate === null || !Number.isFinite(estimate)) return previousPercent;
  return Math.min(99.9, Math.max(previousPercent ?? 0, Math.max(0, estimate)));
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
    liveOutput: [],
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
  const job = state.jobs.find((item) => item.jobIndex === progress.jobIndex);
  const liveOutput = job ? [...job.liveOutput] : [];
  if (progress.liveOutput) liveOutput.push(progress.liveOutput);
  if (progress.command) liveOutput.push({ kind: 'command', command: progress.command });
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
      liveOutput: liveOutput.slice(-100),
    } : job),
  };
};

export const isQueueTerminal = (state: EncodeQueueProgressState) => state.status !== 'running';

export const canFinishEncodeQueue = (state: EncodeQueueProgressState) =>
  isQueueTerminal(state)
  && state.jobs.every((job) => job.status === 'completed' || job.status === 'cancelled');
