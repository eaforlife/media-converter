import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { cleanupRuntimeLogs, runtimeLogNeedsReset } from './install-cleanup';

const MAX_LOG_BYTES = 5 * 1024 * 1024;
let writeQueue = Promise.resolve();

const logPath = () => path.join(app.getPath('userData'), 'app.log');
const logLine = (level: 'INFO' | 'WARN' | 'ERROR', event: string, details?: unknown) => {
  const suffix = details === undefined
    ? ''
    : ` ${typeof details === 'string' ? details : JSON.stringify(details)}`;
  return `${new Date().toISOString()} [${level}] ${event}${suffix}`;
};

const rotateIfNeeded = async () => {
  const target = logPath();
  try {
    const stat = await fs.promises.stat(target);
    if (stat.size < MAX_LOG_BYTES) return;
    const previous = `${target}.1`;
    await fs.promises.rm(previous, { force: true });
    await fs.promises.rename(target, previous);
  } catch {
    // A missing or locked log does not prevent the application from running.
  }
};

export const initializeLogger = async () => {
  const directory = app.getPath('userData');
  await fs.promises.mkdir(directory, { recursive: true });
  if (!app.isPackaged) {
    await fs.promises.rm(logPath(), { force: true }).catch(() => undefined);
    return;
  }
  await cleanupRuntimeLogs(directory);
  const existing = await fs.promises.readFile(logPath(), 'utf8').catch(() => '');
  if (runtimeLogNeedsReset(existing, app.getVersion())) {
    await fs.promises.rm(logPath(), { force: true }).catch(() => undefined);
  }
  await rotateIfNeeded();
};

export const rotateLogForUpdate = async (version: string) => {
  const directory = app.getPath('userData');
  const current = logPath();
  await fs.promises.mkdir(directory, { recursive: true });
  await cleanupRuntimeLogs(directory);
  await fs.promises.rm(current, { force: true }).catch(() => undefined);
  await fs.promises.writeFile(current, `${logLine('INFO', 'application.updated', `App updated to version ${version}`)}\n`, 'utf8');
};

export const logActivity = (
  level: 'INFO' | 'WARN' | 'ERROR',
  event: string,
  details?: unknown,
) => {
  const processOutput = /(?:^|[.])ffmpeg(?:[.]|$)|(?:^|[.])ffprobe(?:[.]|$)/i.test(event);
  const line = `${processOutput ? '\n\n' : ''}${logLine(level, event, details)}\n${processOutput ? '\n\n' : ''}`;
  writeQueue = writeQueue.then(async () => {
    await rotateIfNeeded();
    await fs.promises.appendFile(logPath(), line, 'utf8');
  }).catch(() => undefined);
};

export const readLog = async () => {
  try {
    return await fs.promises.readFile(logPath(), 'utf8');
  } catch {
    return 'No log entries are available yet.';
  }
};
