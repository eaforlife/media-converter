import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const removeWithRetries = async (targetPath: string) => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await fs.promises.rm(targetPath, { force: true });
      return true;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
  return false;
};

export const replaceSourceWithMetadataOutput = async (
  sourcePath: string,
  metadataOutputPath: string,
) => {
  if (path.dirname(sourcePath) !== path.dirname(metadataOutputPath)) {
    throw new Error('Metadata replacement output must be beside its source file.');
  }
  if (!fs.existsSync(sourcePath)) throw new Error(`Source does not exist: ${sourcePath}`);
  if (!fs.existsSync(metadataOutputPath)) {
    throw new Error(`Metadata replacement output does not exist: ${metadataOutputPath}`);
  }

  const sourceParts = path.parse(sourcePath);
  const backupPath = path.join(
    sourceParts.dir,
    `.${sourceParts.name}.ea-metadata-backup-${crypto.randomUUID()}${sourceParts.ext}`,
  );
  await fs.promises.rename(sourcePath, backupPath);
  try {
    await fs.promises.rename(metadataOutputPath, sourcePath);
  } catch (error) {
    try {
      await fs.promises.rename(backupPath, sourcePath);
    } catch (restoreError) {
      throw new AggregateError(
        [error, restoreError],
        `Unable to install the metadata update or restore the original file. Backup: ${backupPath}`,
        { cause: restoreError },
      );
    }
    throw error;
  }

  return { backupPath: await removeWithRetries(backupPath) ? null : backupPath };
};
