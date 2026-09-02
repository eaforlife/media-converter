import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const INSTALL_CLEANUP_RETRIES = 0;
export const INSTALL_CLEANUP_RETRY_DELAY_MS = 0;
export const DEFERRED_CLEANUP_ATTEMPTS = 120;
export const DEFERRED_CLEANUP_RETRY_DELAY_MS = 500;

type InstallVersion = {
  numbers: number[];
  prerelease: boolean;
};

export type InstallCleanupProgress = {
  completed: number;
  total: number;
  name: string;
};

export type InstallCleanupFailure = {
  target: string;
  error: string;
};

export type InstallCleanupResult = {
  targets: string[];
  removed: string[];
  failures: InstallCleanupFailure[];
};

const installVersion = (name: string): InstallVersion | null => {
  const match = /^app-(\d+(?:\.\d+){0,3})(?:-([A-Za-z0-9.-]+))?(?:\+[A-Za-z0-9.-]+)?$/i.exec(name);
  if (!match) return null;
  return {
    numbers: match[1].split('.').map(Number),
    prerelease: Boolean(match[2]),
  };
};

const versionIsOlder = (candidate: InstallVersion, current: InstallVersion) => {
  const length = Math.max(candidate.numbers.length, current.numbers.length);
  for (let index = 0; index < length; index += 1) {
    const difference = (candidate.numbers[index] ?? 0) - (current.numbers[index] ?? 0);
    if (difference !== 0) return difference < 0;
  }
  return candidate.prerelease && !current.prerelease;
};

export const obsoleteInstallDirectoryNames = (names: string[], currentName: string) => {
  const current = installVersion(currentName);
  if (!current) return [];
  return names.filter((name) => {
    const candidate = installVersion(name);
    return candidate !== null && versionIsOlder(candidate, current);
  });
};

export const obsoleteRuntimeLogNames = (names: string[]) => names.filter((name) =>
  /^(?:app_old\d+\.log|app\.log\.\d+)$/i.test(name));

export const runtimeLogNeedsReset = (contents: string, currentVersion: string) => {
  const versions = [...contents.matchAll(/application[.]started .*?"version":"([^"]+)"/g)];
  const latest = versions.at(-1)?.[1];
  return latest !== undefined && latest !== currentVersion;
};

export const cleanupRuntimeLogs = async (directory: string) => {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
  const targets = obsoleteRuntimeLogNames(
    entries.filter((entry) => entry.isFile() && !entry.isSymbolicLink()).map((entry) => entry.name),
  ).map((name) => path.join(directory, name));
  await Promise.allSettled(targets.map((target) => fs.promises.rm(target, { force: true })));
  return targets;
};

export const installCleanupTargets = async (currentDirectory: string) => {
  const resolvedCurrent = path.resolve(currentDirectory);
  const installRoot = path.dirname(resolvedCurrent);
  const canonicalCurrent = resolvedCurrent.toLocaleLowerCase();
  const canonicalRoot = installRoot.toLocaleLowerCase();
  const currentName = path.basename(resolvedCurrent);
  const entries = await fs.promises.readdir(installRoot, { withFileTypes: true });
  const oldVersions = obsoleteInstallDirectoryNames(
    entries.filter((entry) => entry.isDirectory() && !entry.isSymbolicLink()).map((entry) => entry.name),
    currentName,
  );
  const legacyLibrary = entries.find((entry) => entry.isDirectory()
    && !entry.isSymbolicLink() && entry.name.toLowerCase() === 'lib');
  const targets = [
    ...oldVersions.map((name) => path.join(installRoot, name)),
    ...(legacyLibrary ? [path.join(installRoot, legacyLibrary.name)] : []),
  ];
  return targets.filter((target) => {
    const resolved = path.resolve(target);
    return path.dirname(resolved).toLocaleLowerCase() === canonicalRoot
      && resolved.toLocaleLowerCase() !== canonicalCurrent;
  });
};

export const cleanupPreviousInstall = async (
  currentDirectory: string,
  onProgress?: (progress: InstallCleanupProgress) => void,
): Promise<InstallCleanupResult> => {
  const targets = await installCleanupTargets(currentDirectory);
  const removed: string[] = [];
  const failures: InstallCleanupFailure[] = [];
  for (const [index, target] of targets.entries()) {
    const resolved = path.resolve(target);
    onProgress?.({ completed: index, total: targets.length, name: path.basename(resolved) });
    try {
      await fs.promises.rm(resolved, {
        recursive: true,
        force: true,
        maxRetries: INSTALL_CLEANUP_RETRIES,
        retryDelay: INSTALL_CLEANUP_RETRY_DELAY_MS,
      });
      removed.push(resolved);
    } catch (error) {
      failures.push({ target: resolved, error: error instanceof Error ? error.message : String(error) });
    }
  }
  return { targets, removed, failures };
};

export const deferredInstallCleanupScript = (targets: readonly string[], parentPid: number) => {
  const targetData = Buffer.from(JSON.stringify(targets), 'utf8').toString('base64');
  return [
    `$parentPid = ${Math.max(0, Math.trunc(parentPid))}`,
    'try { Wait-Process -Id $parentPid -ErrorAction SilentlyContinue } catch {}',
    `$targetJson = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${targetData}'))`,
    '$targets = ConvertFrom-Json -InputObject $targetJson',
    'foreach ($target in $targets) {',
    `  for ($attempt = 0; $attempt -lt ${DEFERRED_CLEANUP_ATTEMPTS} -and (Test-Path -LiteralPath $target); $attempt++) {`,
    '    try { Remove-Item -LiteralPath $target -Recurse -Force -ErrorAction Stop } catch {}',
    `    if (Test-Path -LiteralPath $target) { Start-Sleep -Milliseconds ${DEFERRED_CLEANUP_RETRY_DELAY_MS} }`,
    '  }',
    '}',
  ].join('\n');
};

export const scheduleInstallCleanupAfterExit = (
  targets: readonly string[],
  parentPid = process.pid,
  platform: NodeJS.Platform = process.platform,
) => {
  if (platform !== 'win32' || targets.length === 0) return false;
  const command = Buffer.from(deferredInstallCleanupScript(targets, parentPid), 'utf16le').toString('base64');
  const windowsRoot = process.env.SystemRoot ?? process.env.WINDIR ?? String.raw`C:\Windows`;
  const powershell = path.join(windowsRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const launcher = [
    `$powershell = '${powershell.replaceAll("'", "''")}'`,
    `$helperArguments = @('-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', '${command}')`,
    'Start-Process -FilePath $powershell -ArgumentList $helperArguments -WindowStyle Hidden',
  ].join('\n');
  const launcherCommand = Buffer.from(launcher, 'utf16le').toString('base64');
  try {
    const result = spawnSync(powershell, [
      '-NoLogo', '-NoProfile', '-NonInteractive', '-EncodedCommand', launcherCommand,
    ], {
      cwd: os.tmpdir(),
      stdio: 'ignore',
      windowsHide: true,
    });
    return result.status === 0 && result.error === undefined;
  } catch {
    return false;
  }
};
