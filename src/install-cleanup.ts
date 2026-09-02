import fs from 'node:fs';
import path from 'node:path';

export const INSTALL_CLEANUP_RETRIES = 10;
export const INSTALL_CLEANUP_RETRY_DELAY_MS = 250;

export const obsoleteInstallDirectoryNames = (names: string[], currentName: string) => names.filter((name) =>
  name.toLocaleLowerCase() !== currentName.toLocaleLowerCase()
  && /^app-(?=[A-Za-z0-9.+-]*\d)[A-Za-z0-9][A-Za-z0-9.+-]*$/i.test(name));

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

export const cleanupPreviousInstall = async (currentDirectory: string) => {
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
  const targets = [
    ...oldVersions.map((name) => path.join(installRoot, name)),
    path.join(installRoot, 'lib'),
  ];
  const results = await Promise.allSettled(targets.map(async (target) => {
    const resolved = path.resolve(target);
    if (path.dirname(resolved).toLocaleLowerCase() !== canonicalRoot
      || resolved.toLocaleLowerCase() === canonicalCurrent) return;
    await fs.promises.rm(resolved, {
      recursive: true,
      force: true,
      maxRetries: INSTALL_CLEANUP_RETRIES,
      retryDelay: INSTALL_CLEANUP_RETRY_DELAY_MS,
    });
  }));
  const failures = results.flatMap((result, index) => result.status === 'rejected'
    ? [new Error(`Unable to remove ${targets[index]}: ${result.reason instanceof Error ? result.reason.message : String(result.reason)}`)]
    : []);
  if (failures.length) throw new AggregateError(failures, 'One or more obsolete installation directories could not be removed');
  return targets;
};
