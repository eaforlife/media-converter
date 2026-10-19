import fs from 'node:fs';
import path from 'node:path';
import { parseCustomPresets } from './custom-presets.ts';

export type CustomPresetMigrationResult = { safeToCleanPrevious: boolean; copiedFrom: string | null };

export const migrateCustomPresetFile = async (
  currentResourcesDirectory: string,
  previousResourcesDirectories: readonly string[],
  legacyDataDirectories: readonly string[],
): Promise<CustomPresetMigrationResult> => {
  const destination = path.join(currentResourcesDirectory, 'custom_preset.ini');
  const validate = async (file: string) => {
    try {
      const contents = await fs.promises.readFile(file, 'utf8');
      parseCustomPresets(contents);
      return { exists: true, contents };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? { exists: false, contents: '' }
        : null;
    }
  };

  const current = await validate(destination);
  if (current?.exists) return { safeToCleanPrevious: true, copiedFrom: null };
  if (!current) return { safeToCleanPrevious: false, copiedFrom: null };

  const candidates = [
    ...previousResourcesDirectories.map((directory) => path.join(directory, 'custom_preset.ini')),
    ...legacyDataDirectories.map((directory) => path.join(directory, 'custom_preset.ini')),
  ];
  for (const candidate of candidates) {
    const source = await validate(candidate);
    if (!source) return { safeToCleanPrevious: false, copiedFrom: null };
    if (!source.exists) continue;
    await fs.promises.mkdir(currentResourcesDirectory, { recursive: true });
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, source.contents, { encoding: 'utf8', flag: 'wx' });
      await fs.promises.rename(temporary, destination);
      return { safeToCleanPrevious: true, copiedFrom: candidate };
    } catch {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      return { safeToCleanPrevious: false, copiedFrom: null };
    }
  }
  return { safeToCleanPrevious: true, copiedFrom: null };
};

const isSameOrParentOf = (parent: string, candidate: string) => {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const removeLegacyDataDirectories = async (directories: readonly string[], activeInstallDirectory: string) => {
  const removed: string[] = [];
  const preserved: string[] = [];
  const seen = new Set<string>();
  for (const directory of directories) {
    const resolved = path.resolve(directory);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isSameOrParentOf(resolved, activeInstallDirectory)) {
      preserved.push(resolved);
      continue;
    }
    try {
      await fs.promises.rm(resolved, { recursive: true, force: true });
      removed.push(resolved);
    } catch {
      preserved.push(resolved);
    }
  }
  return { removed, preserved };
};
