import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';

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
  await fs.promises.mkdir(app.getPath('userData'), { recursive: true });
  await rotateIfNeeded();
};

export const rotateLogForUpdate = async (version: string) => {
  const directory = app.getPath('userData');
  const current = logPath();
  await fs.promises.mkdir(directory, { recursive: true });
  let renamed: string | null = null;
  try {
    await fs.promises.access(current);
    const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '');
    const archiveName = `app_old${stamp}.log`;
    await fs.promises.rename(current, path.join(directory, archiveName));
    renamed = archiveName;
  } catch {
    // A first-time install or missing prior log only needs the update entry.
  }
  const entries = [
    ...(renamed ? [logLine('INFO', 'application.log-renamed', `Renamed old log to ${renamed}`)] : []),
    logLine('INFO', 'application.updated', `App updated to version ${version}`),
  ];
  await fs.promises.writeFile(current, `${entries.join('\n')}\n`, 'utf8');
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
