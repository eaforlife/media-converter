import fs from 'node:fs';
import path from 'node:path';

export const INSTALL_CLEANUP_RETRIES = 2;
export const INSTALL_CLEANUP_RETRY_DELAY_MS = 100;

type InstallVersion = {
  numbers: number[];
  prerelease: boolean;
};

export type InstallCleanupProgress = {
  completed: number;
  total: number;
  name: string;
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

export const cleanupPreviousInstall = async (
  currentDirectory: string,
  onProgress?: (progress: InstallCleanupProgress) => void,
) => {
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
  const failures: Error[] = [];
  for (const [index, target] of targets.entries()) {
    const resolved = path.resolve(target);
    if (path.dirname(resolved).toLocaleLowerCase() !== canonicalRoot
      || resolved.toLocaleLowerCase() === canonicalCurrent) continue;
    onProgress?.({ completed: index, total: targets.length, name: path.basename(resolved) });
    try {
      await fs.promises.rm(resolved, {
        recursive: true,
        force: true,
        maxRetries: INSTALL_CLEANUP_RETRIES,
        retryDelay: INSTALL_CLEANUP_RETRY_DELAY_MS,
      });
    } catch (error) {
      failures.push(new Error(
        `Unable to remove ${target}: ${error instanceof Error ? error.message : String(error)}`,
      ));
    }
  }
  if (failures.length) throw new AggregateError(failures, 'One or more obsolete installation directories could not be removed');
  return targets;
};
