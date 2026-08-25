import fs from 'node:fs';
import path from 'node:path';

export const obsoleteInstallDirectoryNames = (names: string[], currentName: string) => names.filter((name) =>
  name !== currentName && /^app-\d+(?:\.\d+){1,3}(?:[-+][A-Za-z0-9.-]+)?$/i.test(name));

export const cleanupPreviousInstall = async (currentDirectory: string) => {
  const resolvedCurrent = path.resolve(currentDirectory);
  const installRoot = path.dirname(resolvedCurrent);
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
  for (const target of targets) {
    const resolved = path.resolve(target);
    if (path.dirname(resolved) !== installRoot || resolved === resolvedCurrent) continue;
    await fs.promises.rm(resolved, { recursive: true, force: true });
  }
  return targets;
};
