import { app } from 'electron';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { MediaInfo } from './shared-types';

let previewRoot = '';
const previewFiles = new Map<string, string>();

const getPreviewRoot = () => {
  if (!previewRoot) previewRoot = path.join(app.getPath('temp'), 'ea-media-tools-previews');
  return previewRoot;
};

const execute = (file: string, args: string[], timeout = 45_000): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 8 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve(`${stdout}\n${stderr}`);
      });
  });

export const initializePreviewStorage = async () => {
  const root = getPreviewRoot();
  await fs.promises.rm(root, { recursive: true, force: true });
  await fs.promises.mkdir(root, { recursive: true });
};

const createThumbnail = async (
  ffmpegPath: string,
  sourcePath: string,
  duration: number | null,
) => {
  const id = crypto.randomUUID();
  const outputPath = path.join(getPreviewRoot(), `${id}.jpg`);
  const seek = Math.max(0, (duration ?? 0) * 0.35);
  await execute(ffmpegPath, [
    '-hide_banner', '-loglevel', 'error', '-ss', seek.toFixed(3), '-i', sourcePath,
    '-frames:v', '1', '-vf', 'scale=-2:320', '-q:v', '3', '-y', outputPath,
  ]);
  const data = await fs.promises.readFile(outputPath);
  previewFiles.set(id, outputPath);
  return { previewId: id, previewDataUrl: `data:image/jpeg;base64,${data.toString('base64')}` };
};

const detectCrop = async (
  ffmpegPath: string,
  sourcePath: string,
  duration: number | null,
) => {
  const seek = Math.max(0, (duration ?? 0) * 0.40);
  const output = await execute(ffmpegPath, [
    '-hide_banner', '-ss', seek.toFixed(3), '-i', sourcePath, '-frames:v', '100',
    '-vf', 'cropdetect=limit=24:round=2:reset=0', '-an', '-f', 'null', '-',
  ]);
  const matches = [...output.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)];
  return matches.at(-1)?.[1] ?? null;
};

export const analyzeVisual = async (
  ffmpegPath: string,
  sourcePath: string,
  media: MediaInfo,
) => {
  const [preview, suggestedCrop] = await Promise.all([
    createThumbnail(ffmpegPath, sourcePath, media.duration).catch(() => ({})),
    detectCrop(ffmpegPath, sourcePath, media.duration).catch(() => null),
  ]);
  media.suggestedCrop = suggestedCrop;
  return preview;
};

export const releasePreviews = async (ids: string[]) => {
  await Promise.all(ids.map(async (id) => {
    const previewPath = previewFiles.get(id);
    if (!previewPath) return;
    previewFiles.delete(id);
    await fs.promises.rm(previewPath, { force: true });
  }));
};

export const cleanupPreviews = async () => {
  previewFiles.clear();
  await fs.promises.rm(getPreviewRoot(), { recursive: true, force: true });
};
