import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, type WebContents } from 'electron';
import { logActivity } from './app-logger';
import type { EncodeJob, EncodeProgress, EncodeStartResult } from './shared-types';

const activeProcesses = new Set<ChildProcessWithoutNullStreams>();
const cancelCooldowns = new Set<() => void>();
let queueRunning = false;
let cancellationRequested = false;
let cancellationEventEmitted = false;
let queueFailureRequested = false;

const ENCODE_COOLDOWN_MS = 10_000;

const parseClock = (value: string | undefined) => {
  const match = value?.match(/^(\d+):(\d+):(\d+(?:\.\d+)?)$/);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
};

const numericSpeed = (value: string | undefined) => {
  const speed = Number(value?.replace(/x$/i, ''));
  return Number.isFinite(speed) && speed > 0 ? speed : null;
};

const emit = (webContents: WebContents, progress: EncodeProgress) => {
  if (webContents.isDestroyed()) return;
  webContents.send('encode:progress', progress);
  const owner = BrowserWindow.fromWebContents(webContents);
  if (!owner) return;
  if (progress.phase === 'failed' || progress.phase === 'cancelled' || progress.phase === 'queue-completed') {
    owner.setProgressBar(-1);
  } else if (progress.percent === null) {
    owner.setProgressBar(2, { mode: 'indeterminate' });
  } else {
    owner.setProgressBar(progress.percent / 100, { mode: 'normal' });
  }
};

const removePartialOutput = async (outputPath: string) => {
  await fs.promises.rm(outputPath, { force: true }).catch(() => undefined);
};

const waitForEncodeCooldown = () => new Promise<boolean>((resolve) => {
  const state: { settled: boolean; timer?: ReturnType<typeof setTimeout> } = { settled: false };
  const cancel = () => finish(false);
  const finish = (elapsed: boolean) => {
    if (state.settled) return;
    state.settled = true;
    if (state.timer) clearTimeout(state.timer);
    cancelCooldowns.delete(cancel);
    resolve(elapsed);
  };
  state.timer = setTimeout(() => finish(true), ENCODE_COOLDOWN_MS);
  cancelCooldowns.add(cancel);
});

const isNvencJob = (job: EncodeJob) => job.args.some((argument, index) =>
  argument === '-c:v' && job.args[index + 1]?.endsWith('_nvenc'));

const stopActiveProcesses = () => {
  for (const process of activeProcesses) process.kill();
};

const runJob = (
  ffmpegPath: string,
  job: EncodeJob,
  jobIndex: number,
  totalJobs: number,
  webContents: WebContents,
) => new Promise<void>((resolve, reject) => {
  const startedAt = Date.now();
  const outputParts = path.parse(job.outputPath);
  const temporaryOutput = path.join(
    outputParts.dir,
    `.${outputParts.name}.ea-part-${crypto.randomUUID()}${outputParts.ext}`,
  );
  const processArguments = [...job.args];
  processArguments[processArguments.length - 1] = temporaryOutput;
  let stdoutBuffer = '';
  let stderr = '';
  let block: Record<string, string> = {};
  let settled = false;

  const status = (phase: EncodeProgress['phase'], message?: string): EncodeProgress => {
    const encodedSeconds = Number(block.out_time_us) > 0
      ? Number(block.out_time_us) / 1_000_000
      : parseClock(block.out_time);
    const duration = job.duration && job.duration > 0 ? job.duration : null;
    const percent = duration ? Math.min(100, Math.max(0, (encodedSeconds / duration) * 100)) : null;
    const speed = numericSpeed(block.speed);
    return {
      phase,
      jobIndex,
      totalJobs,
      sourceName: job.sourceName,
      outputPath: job.outputPath,
      percent: phase === 'completed' ? 100 : percent,
      bitrate: block.bitrate && block.bitrate !== 'N/A' ? block.bitrate : '—',
      fps: block.fps && block.fps !== 'N/A' ? block.fps : '—',
      runTimeSeconds: Math.max(0, (Date.now() - startedAt) / 1000),
      etaSeconds: duration && speed ? Math.max(0, (duration - encodedSeconds) / speed) : null,
      speed: block.speed && block.speed !== 'N/A' ? block.speed : '—',
      command: phase === 'starting'
        ? [ffmpegPath, '-hide_banner', '-nostdin', '-nostats', '-progress', 'pipe:1', ...processArguments]
        : undefined,
      message,
    };
  };

  emit(webContents, status('starting'));
  logActivity('INFO', 'ffmpeg.encode.started', {
    job: jobIndex,
    totalJobs,
    source: job.sourcePath,
    output: job.outputPath,
    executable: ffmpegPath,
    args: job.args,
  });

  const child = spawn(ffmpegPath, [
    '-hide_banner', '-nostdin', '-nostats', '-progress', 'pipe:1', ...processArguments,
  ], { windowsHide: true, shell: false });
  activeProcesses.add(child);

  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    stdoutBuffer += chunk;
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';
    for (const line of lines) {
      const separator = line.indexOf('=');
      if (separator < 0) continue;
      const key = line.slice(0, separator);
      block[key] = line.slice(separator + 1);
      if (key === 'progress') {
        emit(webContents, status(block.progress === 'end' ? 'completed' : 'encoding'));
        if (block.progress !== 'end') block = {};
      }
    }
  });

  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => {
    stderr = `${stderr}${chunk}`.slice(-2 * 1024 * 1024);
  });

  child.on('error', (error) => {
    if (settled) return;
    settled = true;
    activeProcesses.delete(child);
    void removePartialOutput(temporaryOutput);
    logActivity('ERROR', 'ffmpeg.encode.failed', { job: jobIndex, error: error.message });
    emit(webContents, status('failed', error.message));
    reject(error);
  });
  child.on('close', async (code) => {
    if (settled) return;
    settled = true;
    activeProcesses.delete(child);
    if (cancellationRequested) {
      await removePartialOutput(temporaryOutput);
      cancellationEventEmitted = true;
      emit(webContents, status('cancelled', 'Encoding was cancelled.'));
      reject(new Error('Encoding was cancelled.'));
      return;
    }
    if (queueFailureRequested) {
      await removePartialOutput(temporaryOutput);
      reject(new Error('Encoding stopped because another job failed.'));
      return;
    }
    if (code === 0) {
      try {
        if (fs.existsSync(job.outputPath)) throw new Error(`Output already exists: ${job.outputPath}`);
        await fs.promises.rename(temporaryOutput, job.outputPath);
        logActivity('INFO', 'ffmpeg.encode.completed', {
          job: jobIndex,
          outputPath: job.outputPath,
          runTimeSeconds: (Date.now() - startedAt) / 1000,
          ffmpegOutput: stderr.trim(),
        });
        emit(webContents, status('completed'));
        resolve();
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to finalize the output file.';
        await removePartialOutput(temporaryOutput);
        logActivity('ERROR', 'ffmpeg.encode.failed', { job: jobIndex, error: message });
        emit(webContents, status('failed', message));
        reject(new Error(message));
      }
      return;
    }
    const message = stderr.trim().split(/\r?\n/).slice(-8).join('\n') || `FFmpeg exited with code ${code ?? 'unknown'}.`;
    await removePartialOutput(temporaryOutput);
    logActivity('ERROR', 'ffmpeg.encode.failed', { job: jobIndex, code, output: stderr.trim() });
    emit(webContents, status('failed', message));
    reject(new Error(message));
  });
});

export const startEncodeQueue = async (
  ffmpegPath: string,
  jobs: EncodeJob[],
  webContents: WebContents,
): Promise<EncodeStartResult> => {
  if (queueRunning) return { started: false, message: 'An encoding queue is already running.' };
  if (!ffmpegPath) return { started: false, message: 'FFmpeg is unavailable.' };
  if (!jobs.length) return { started: false, message: 'There are no jobs to encode.' };
  if (jobs.some((job) => !path.isAbsolute(job.sourcePath) || !path.isAbsolute(job.outputPath) || !job.args.length)) {
    return { started: false, message: 'The encoding queue contains an invalid path or command.' };
  }
  const missingSource = jobs.find((job) => !fs.existsSync(job.sourcePath));
  if (missingSource) {
    return { started: false, message: `Source does not exist: ${missingSource.sourcePath}` };
  }
  const normalizedOutputs = jobs.map((job) => process.platform === 'win32'
    ? path.resolve(job.outputPath).toLowerCase()
    : path.resolve(job.outputPath));
  if (new Set(normalizedOutputs).size !== normalizedOutputs.length) {
    return { started: false, message: 'Two queued jobs use the same output file.' };
  }
  const existing = jobs.find((job) => fs.existsSync(job.outputPath));
  if (existing) {
    return { started: false, message: `Output already exists: ${existing.outputPath}` };
  }

  await Promise.all(jobs.map((job) => fs.promises.mkdir(path.dirname(job.outputPath), { recursive: true })));
  queueRunning = true;
  cancellationRequested = false;
  cancellationEventEmitted = false;
  queueFailureRequested = false;
  const queueStartedAt = Date.now();
  const concurrency = jobs.length > 1 && jobs.every(isNvencJob) ? 2 : 1;
  logActivity('INFO', 'ffmpeg.queue.started', { jobs: jobs.length, concurrency, cooldownSeconds: 10 });

  void (async () => {
    try {
      let nextIndex = 0;
      const runWorker = async () => {
        let completedAJob = false;
        while (!cancellationRequested && !queueFailureRequested) {
          if (completedAJob && nextIndex < jobs.length) {
            const elapsed = await waitForEncodeCooldown();
            if (!elapsed || cancellationRequested || queueFailureRequested) return;
          }
          if (nextIndex >= jobs.length) return;
          const index = nextIndex;
          nextIndex += 1;
          try {
            await runJob(ffmpegPath, jobs[index], index + 1, jobs.length, webContents);
            completedAJob = true;
          } catch (error) {
            if (!cancellationRequested && !queueFailureRequested) {
              queueFailureRequested = true;
              for (const cancel of [...cancelCooldowns]) cancel();
              stopActiveProcesses();
            }
            throw error;
          }
        }
      };
      await Promise.allSettled(Array.from({ length: concurrency }, runWorker));
      if (cancellationRequested && !cancellationEventEmitted) {
        const index = Math.min(nextIndex, jobs.length - 1);
        const job = jobs[index];
        emit(webContents, {
          phase: 'cancelled', jobIndex: index + 1, totalJobs: jobs.length,
          sourceName: job.sourceName, outputPath: job.outputPath, percent: null,
          bitrate: '—', fps: '—', runTimeSeconds: (Date.now() - queueStartedAt) / 1000,
          etaSeconds: null, speed: '—', message: 'Encoding was cancelled.',
        });
      } else if (!cancellationRequested && !queueFailureRequested) {
        const last = jobs[jobs.length - 1];
        emit(webContents, {
          phase: 'queue-completed', jobIndex: jobs.length, totalJobs: jobs.length,
          sourceName: last.sourceName, outputPath: last.outputPath, percent: 100,
          bitrate: '—', fps: '—', runTimeSeconds: (Date.now() - queueStartedAt) / 1000,
          etaSeconds: 0, speed: '—',
        });
      }
    } finally {
      activeProcesses.clear();
      cancelCooldowns.clear();
      queueRunning = false;
      cancellationRequested = false;
      cancellationEventEmitted = false;
      queueFailureRequested = false;
    }
  })();

  return { started: true };
};

export const cancelEncoding = () => {
  if (!queueRunning) return false;
  cancellationRequested = true;
  for (const cancel of [...cancelCooldowns]) cancel();
  stopActiveProcesses();
  return true;
};
