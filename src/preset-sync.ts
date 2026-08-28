import fs from 'node:fs';
import path from 'node:path';
import { parseBuiltInPresetConfiguration } from './presets.ts';

export const MAX_REMOTE_PRESET_BYTES = 64 * 1024;

const comparablePresetContents = (contents: string) => contents
  .replace(/^\uFEFF/, '')
  .replace(/\r\n?/g, '\n');

export const presetContentsMatch = (left: string, right: string) =>
  comparablePresetContents(left) === comparablePresetContents(right);

export const validateRemotePresetContents = (contents: string) => {
  if (Buffer.byteLength(contents, 'utf8') > MAX_REMOTE_PRESET_BYTES) {
    throw new Error(`Remote presets.ini exceeds ${MAX_REMOTE_PRESET_BYTES} bytes`);
  }
  parseBuiltInPresetConfiguration(contents);
  return contents;
};

export const synchronizePresetFile = async (target: string, remoteContents: string) => {
  validateRemotePresetContents(remoteContents);
  const current = await fs.promises.readFile(target, 'utf8').catch(() => null);
  if (current !== null && presetContentsMatch(current, remoteContents)) return false;

  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(
    path.dirname(target),
    `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`,
  );
  try {
    await fs.promises.writeFile(temporary, remoteContents, { encoding: 'utf8', flag: 'wx' });
    await fs.promises.rename(temporary, target);
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
  return true;
};
