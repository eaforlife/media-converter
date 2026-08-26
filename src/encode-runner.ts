import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { BrowserWindow, type WebContents } from 'electron';
import { logActivity } from './app-logger';
import { ccextractorArguments, injectClosedCaptionInput } from './closed-caption';
import {
  ADAPTIVE_SAMPLE_MS, averageAggregateFps, canAddEncodeJob, encoderConcurrencyLimit,
} from './encode-concurrency';
import { rsgainArguments, successfulNormalizationRoots } from './audio-workflow';
import { replaceSourceWithMetadataOutput } from './metadata-replacement';
import type { EncodeJob, EncodeProgress, EncodeStartResult } from './shared-types';

const activeProcesses = new Map<number, ChildProcessWithoutNullStreams>();
const cancelCooldowns = new Set<() => void>();
const cancelledJobs = new Set<number>();
const activePartialOutputs = new Set<string>();
const activeCaptionOutputs = new Set<string>();
let queueRunning = false;
let cancellationRequested = false;
let queueFailureRequested = false;
let queueFailureMessage: string | undefined;
let activeQueuePromise: Promise<void> | null = null;

const ENCODE_COOLDOWN_MS = ADAPTIVE_SAMPLE_MS;
const SHUTDOWN_GRACE_MS = 8_000;
const SHUTDOWN_FORCE_MS = 2_000;

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
  try {
    await fs.promises.rm(outputPath, { force: true });
  } catch {
    // A final shutdown pass retries files that were still locked by FFmpeg.
  } finally {
    if (!fs.existsSync(outputPath)) activePartialOutputs.delete(outputPath);
  }
};

const waitForQueue = (queue: Promise<void>, timeoutMs: number) => new Promise<boolean>((resolve) => {
  const timer = setTimeout(() => resolve(false), timeoutMs);
  void queue.then(
    () => { clearTimeout(timer); resolve(true); },
    () => { clearTimeout(timer); resolve(true); },
  );
});

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

const stopActiveProcesses = () => {
  for (const process of activeProcesses.values()) process.kill();
};

class EncodeCancelledError extends Error {
  constructor(readonly wholeQueue: boolean) {
    super(wholeQueue ? 'Encoding queue was cancelled.' : 'Encode was cancelled.');
  }
}

const extractClosedCaptions = (
  ccextractorPath: string,
  job: EncodeJob,
  jobIndex: number,
  totalJobs: number,
  outputPath: string,
  webContents: WebContents,
) => new Promise<boolean>((resolve, reject) => {
  const args = ccextractorArguments(job.sourcePath, outputPath);
  let stderr = '';
  let settled = false;
  emit(webContents, {
    phase: 'starting', jobIndex, totalJobs, sourceName: job.sourceName,
    outputPath: job.outputPath, percent: null, bitrate: '—', fps: '—',
    runTimeSeconds: 0, etaSeconds: null, speed: '—',
    message: 'Extracting embedded closed captions to SRT.',
  });
  logActivity('INFO', 'ccextractor.started', {
    job: jobIndex, source: job.sourcePath, output: outputPath, executable: ccextractorPath, args,
  });
  const child = spawn(ccextractorPath, args, { windowsHide: true, shell: false });
  activeProcesses.set(jobIndex, child);
  child.stderr.setEncoding('utf8');
  child.stderr.on('data', (chunk: string) => { stderr = `${stderr}${chunk}`.slice(-1024 * 1024); });
  child.on('error', (error) => {
    if (settled) return;
    settled = true;
    activeProcesses.delete(jobIndex);
    reject(new Error(`CCExtractor could not start: ${error.message}`));
  });
  child.on('close', (code) => {
    if (settled) return;
    settled = true;
    activeProcesses.delete(jobIndex);
    const jobCancellationRequested = cancelledJobs.delete(jobIndex);
    if (cancellationRequested || jobCancellationRequested) {
      reject(new EncodeCancelledError(cancellationRequested));
      return;
    }
    if (code !== 0 || !fs.existsSync(outputPath) || fs.statSync(outputPath).size === 0) {
      if (job.optionalClosedCaptions) {
        logActivity('INFO', 'ccextractor.not-found', { job: jobIndex, source: job.sourcePath });
        resolve(false);
        return;
      }
      const detail = stderr.trim().split(/\r?\n/).slice(-6).join('\n');
      reject(new Error(detail || 'CCExtractor did not find embedded CEA-608/708 captions.'));
      return;
    }
    logActivity('INFO', 'ccextractor.completed', { job: jobIndex, output: outputPath });
    resolve(true);
  });
});

const copySidecars = async (job: EncodeJob) => {
  for (const sidecar of job.sidecarCopies ?? []) {
    await fs.promises.mkdir(path.dirname(sidecar.outputPath), { recursive: true });
    await fs.promises.copyFile(sidecar.sourcePath, sidecar.outputPath);
    logActivity('INFO', 'audio.sidecar.copied', sidecar);
  }
};

const runRsgain = (
  rsgainPath: string,
  root: string,
  job: EncodeJob,
  jobIndex: number,
  totalJobs: number,
  webContents: WebContents,
) => new Promise<void>((resolve, reject) => {
  const args = rsgainArguments(root);
  emit(webContents, {
    phase: 'starting', jobIndex, totalJobs, sourceName: job.sourceName, outputPath: root,
    percent: null, bitrate: '—', fps: '—', runTimeSeconds: 0, etaSeconds: null, speed: '—',
    message: 'Normalizing the completed audio library with rsgain.',
  });
  logActivity('INFO', 'rsgain.started', { executable: rsgainPath, args, root });
  const child = spawn(rsgainPath, args, { windowsHide: true, shell: false });
  let output = '';
  let settled = false;
  activeProcesses.set(jobIndex, child);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => { output = `${output}${chunk}`.slice(-2 * 1024 * 1024); });
  child.stderr.on('data', (chunk: string) => { output = `${output}${chunk}`.slice(-2 * 1024 * 1024); });
  child.on('error', (error) => {
    if (settled) return;
    settled = true;
    activeProcesses.delete(jobIndex);
    reject(new Error(`rsgain could not start: ${error.message}`));
  });
  child.on('close', (code) => {
    if (settled) return;
    settled = true;
    activeProcesses.delete(jobIndex);
    const jobCancellationRequested = cancelledJobs.delete(jobIndex);
    if (cancellationRequested || jobCancellationRequested) {
      reject(new EncodeCancelledError(true));
      return;
    }
    if (code !== 0) {
      reject(new Error(output.trim().split(/\r?\n/).slice(-8).join('\n') || `rsgain exited with code ${code ?? 'unknown'}.`));
      return;
    }
    logActivity('INFO', 'rsgain.completed', { root, output: output.trim() });
    emit(webContents, {
      phase: 'completed', jobIndex, totalJobs, sourceName: job.sourceName, outputPath: root,
      percent: 100, bitrate: '—', fps: '—', runTimeSeconds: 0, etaSeconds: 0, speed: '—',
      message: 'Audio encoding and library normalization completed.',
    });
    resolve();
  });
});

const runJob = (
  ffmpegPath: string,
  job: EncodeJob,
  jobIndex: number,
  totalJobs: number,
  webContents: WebContents,
  onFps?: (fps: number) => void,
) => new Promise<void>((resolve, reject) => {
  const startedAt = Date.now();
  const outputParts = path.parse(job.outputPath);
  const temporaryOutput = path.join(
    outputParts.dir,
    `.${outputParts.name}.ea-part-${crypto.randomUUID()}${outputParts.ext}`,
  );
  activePartialOutputs.add(temporaryOutput);
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
      outputPath: job.replaceSourcePath ?? job.outputPath,
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
  activeProcesses.set(jobIndex, child);

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
        const fps = Number(block.fps);
        if (block.progress !== 'end' && Number.isFinite(fps) && fps > 0) onFps?.(fps);
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
    activeProcesses.delete(jobIndex);
    void removePartialOutput(temporaryOutput);
    logActivity('ERROR', 'ffmpeg.encode.failed', { job: jobIndex, error: error.message });
    emit(webContents, status('failed', error.message));
    reject(error);
  });
  child.on('close', async (code) => {
    if (settled) return;
    settled = true;
    activeProcesses.delete(jobIndex);
    const jobCancellationRequested = cancelledJobs.delete(jobIndex);
    if (cancellationRequested || jobCancellationRequested) {
      await removePartialOutput(temporaryOutput);
      emit(webContents, status('cancelled', 'Encoding was cancelled.'));
      reject(new EncodeCancelledError(cancellationRequested));
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
        activePartialOutputs.delete(temporaryOutput);
        if (job.replaceSourcePath) {
          const replacement = await replaceSourceWithMetadataOutput(job.replaceSourcePath, job.outputPath);
          if (replacement.backupPath) {
            logActivity('WARN', 'ffmpeg.metadata.backup-retained', {
              job: jobIndex,
              backupPath: replacement.backupPath,
            });
          }
        }
        logActivity('INFO', 'ffmpeg.encode.completed', {
          job: jobIndex,
          outputPath: job.replaceSourcePath ?? job.outputPath,
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
  ccextractorPath: string,
  rsgainPath: string,
  jobs: EncodeJob[],
  webContents: WebContents,
): Promise<EncodeStartResult> => {
  if (queueRunning) return { started: false, message: 'An encoding queue is already running.' };
  if (!ffmpegPath) return { started: false, message: 'FFmpeg is unavailable.' };
  if (jobs.some((job) => job.closedCaptionFormat) && !ccextractorPath) {
    return { started: false, message: 'CCExtractor is unavailable.' };
  }
  if (jobs.some((job) => job.normalizeRoot) && !rsgainPath) {
    return { started: false, message: 'rsgain is unavailable.' };
  }
  if (!jobs.length) return { started: false, message: 'There are no jobs to encode.' };
  if (jobs.some((job) => !path.isAbsolute(job.sourcePath) || !path.isAbsolute(job.outputPath) || (!job.args.length && !job.passthrough))) {
    return { started: false, message: 'The encoding queue contains an invalid path or command.' };
  }
  const invalidReplacement = jobs.find((job) => job.replaceSourcePath && (
    !path.isAbsolute(job.replaceSourcePath)
    || path.resolve(job.replaceSourcePath) !== path.resolve(job.sourcePath)
    || path.dirname(job.outputPath) !== path.dirname(job.sourcePath)
  ));
  if (invalidReplacement) {
    return { started: false, message: 'A metadata replacement job contains an invalid source or temporary path.' };
  }
  const missingSource = jobs.find((job) => !fs.existsSync(job.sourcePath));
  if (missingSource) {
    return { started: false, message: `Source does not exist: ${missingSource.sourcePath}` };
  }
  const outputJobs = jobs.filter((job) => !job.passthrough);
  const normalizedOutputs = outputJobs.map((job) => process.platform === 'win32'
    ? path.resolve(job.outputPath).toLowerCase()
    : path.resolve(job.outputPath));
  if (new Set(normalizedOutputs).size !== normalizedOutputs.length) {
    return { started: false, message: 'Two queued jobs use the same output file.' };
  }
  const existing = outputJobs.find((job) => fs.existsSync(job.outputPath));
  if (existing) {
    return { started: false, message: `Output already exists: ${existing.outputPath}` };
  }

  await Promise.all(outputJobs.map((job) => fs.promises.mkdir(path.dirname(job.outputPath), { recursive: true })));
  queueRunning = true;
  cancellationRequested = false;
  queueFailureRequested = false;
  queueFailureMessage = undefined;
  cancelledJobs.clear();
  const queueStartedAt = Date.now();
  const concurrencyLimit = encoderConcurrencyLimit(jobs);
  const useCooldown = jobs.some((job) => job.args.includes('-c:v'));
  logActivity('INFO', 'ffmpeg.queue.started', {
    jobs: jobs.length, concurrency: 1, concurrencyLimit, adaptiveSampleSeconds: 10,
    minimumFpsPerJob: 200, cooldownSeconds: useCooldown ? 10 : 0,
  });

  const queuePromise = (async () => {
    try {
      let nextIndex = 0;
      let queueHadCancelledJob = false;
      let targetConcurrency = 1;
      const fpsWindows = new Map<number, number[]>();
      const workers: Promise<void>[] = [];
      const runWorker = async () => {
        let completedAJob = false;
        while (!cancellationRequested && !queueFailureRequested) {
          if (useCooldown && completedAJob && nextIndex < jobs.length) {
            const elapsed = await waitForEncodeCooldown();
            if (!elapsed || cancellationRequested || queueFailureRequested) return;
          }
          if (nextIndex >= jobs.length) return;
          const index = nextIndex;
          nextIndex += 1;
          let captionOutput: string | null = null;
          try {
            let preparedJob = jobs[index];
            if (preparedJob.passthrough) {
              emit(webContents, {
                phase: 'completed', jobIndex: index + 1, totalJobs: jobs.length,
                sourceName: preparedJob.sourceName, outputPath: preparedJob.outputPath, percent: 100,
                bitrate: '—', fps: '—', runTimeSeconds: 0, etaSeconds: 0, speed: '—',
                message: 'Audio retained without conversion.',
              });
              completedAJob = true;
              continue;
            }
            if (preparedJob.closedCaptionFormat) {
              const outputParts = path.parse(preparedJob.outputPath);
              captionOutput = path.join(
                outputParts.dir,
                `.${outputParts.name}.ea-captions-${crypto.randomUUID()}.srt`,
              );
              activeCaptionOutputs.add(captionOutput);
              const captionsFound = await extractClosedCaptions(
                ccextractorPath, preparedJob, index + 1, jobs.length, captionOutput, webContents,
              );
              if (captionsFound) {
                preparedJob = {
                  ...preparedJob,
                  args: injectClosedCaptionInput(
                    preparedJob.args,
                    preparedJob.sourcePath,
                    captionOutput,
                    preparedJob.closedCaptionFormat,
                  ),
                };
              }
            }
            fpsWindows.set(index, []);
            await runJob(ffmpegPath, preparedJob, index + 1, jobs.length, webContents, (fps) => {
              fpsWindows.get(index)?.push(fps);
            });
            await copySidecars(preparedJob);
            completedAJob = true;
          } catch (error) {
            if (error instanceof EncodeCancelledError && !error.wholeQueue) {
              queueHadCancelledJob = true;
              completedAJob = true;
              continue;
            }
            if (!cancellationRequested && !queueFailureRequested) {
              queueFailureRequested = true;
              queueFailureMessage = error instanceof Error ? error.message : 'Encoding failed.';
              for (const cancel of [...cancelCooldowns]) cancel();
              stopActiveProcesses();
            }
            return;
          } finally {
            fpsWindows.delete(index);
            if (captionOutput) {
              await fs.promises.rm(captionOutput, { force: true }).catch(() => undefined);
              activeCaptionOutputs.delete(captionOutput);
            }
          }
        }
      };
      const launchWorker = () => { workers.push(runWorker()); };
      launchWorker();
      while (
        concurrencyLimit > 1 && nextIndex < jobs.length
        && !cancellationRequested && !queueFailureRequested
      ) {
        const elapsed = await waitForEncodeCooldown();
        if (!elapsed || cancellationRequested || queueFailureRequested) break;
        const aggregateFps = averageAggregateFps(fpsWindows.values());
        const expanded = nextIndex < jobs.length
          && canAddEncodeJob(aggregateFps, targetConcurrency, concurrencyLimit);
        logActivity('INFO', 'ffmpeg.queue.concurrency.sample', {
          aggregateFps, activeTarget: targetConcurrency, concurrencyLimit, expanded,
        });
        for (const samples of fpsWindows.values()) samples.length = 0;
        if (expanded) {
          targetConcurrency += 1;
          launchWorker();
        }
      }
      await Promise.allSettled(workers);
      if (!cancellationRequested && !queueFailureRequested) {
        try {
          const normalizeRoots = successfulNormalizationRoots(jobs, !queueHadCancelledJob);
          for (const root of normalizeRoots) {
            await runRsgain(rsgainPath, root, jobs[jobs.length - 1], jobs.length, jobs.length, webContents);
          }
        } catch (error) {
          if (error instanceof EncodeCancelledError) cancellationRequested = true;
          else {
            queueFailureRequested = true;
            queueFailureMessage = error instanceof Error ? error.message : 'Audio normalization failed.';
          }
        }
      }
      const index = Math.max(0, Math.min(nextIndex - 1, jobs.length - 1));
      const job = jobs[index];
      if (cancellationRequested) {
        emit(webContents, {
          phase: 'queue-cancelled', jobIndex: index + 1, totalJobs: jobs.length,
          sourceName: job.sourceName, outputPath: job.outputPath, percent: null,
          bitrate: '—', fps: '—', runTimeSeconds: (Date.now() - queueStartedAt) / 1000,
          etaSeconds: null, speed: '—', message: 'All active encodes were cancelled.',
        });
      } else if (queueFailureRequested) {
        emit(webContents, {
          phase: 'queue-failed', jobIndex: index + 1, totalJobs: jobs.length,
          sourceName: job.sourceName, outputPath: job.outputPath, percent: null,
          bitrate: '—', fps: '—', runTimeSeconds: (Date.now() - queueStartedAt) / 1000,
          etaSeconds: null, speed: '—', message: queueFailureMessage ?? 'The encoding queue stopped after a failure.',
        });
      } else {
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
      cancelledJobs.clear();
      queueRunning = false;
      cancellationRequested = false;
      queueFailureRequested = false;
      queueFailureMessage = undefined;
    }
  })();
  activeQueuePromise = queuePromise;
  const clearActiveQueue = () => {
    if (activeQueuePromise === queuePromise) activeQueuePromise = null;
  };
  void queuePromise.then(clearActiveQueue, clearActiveQueue);

  return { started: true };
};

export const cancelEncoding = (jobIndex?: number) => {
  if (!queueRunning) return false;
  if (jobIndex !== undefined) {
    const process = activeProcesses.get(jobIndex);
    if (!process) return false;
    cancelledJobs.add(jobIndex);
    const killed = process.kill();
    if (!killed) cancelledJobs.delete(jobIndex);
    return killed;
  }
  cancellationRequested = true;
  for (const cancel of [...cancelCooldowns]) cancel();
  stopActiveProcesses();
  return true;
};

export const cancelEncodingAndWait = async () => {
  cancelEncoding();
  const queue = activeQueuePromise;
  if (queue && !(await waitForQueue(queue, SHUTDOWN_GRACE_MS))) {
    logActivity('WARN', 'ffmpeg.queue.shutdown-timeout', { activeJobs: [...activeProcesses.keys()] });
    for (const process of activeProcesses.values()) process.kill('SIGKILL');
    await waitForQueue(queue, SHUTDOWN_FORCE_MS);
  }
  await Promise.all([...activePartialOutputs].map(removePartialOutput));
  await Promise.all([...activeCaptionOutputs].map(async (captionPath) => {
    await fs.promises.rm(captionPath, { force: true }).catch(() => undefined);
    activeCaptionOutputs.delete(captionPath);
  }));
};

export const isEncodingActive = () => queueRunning;
