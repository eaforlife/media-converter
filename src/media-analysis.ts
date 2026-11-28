import { app } from 'electron';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { HardwareCapabilities, MediaInfo } from './shared-types';
import { stableCropConsensus } from './video-crop';
import { APP_CONFIG } from './config';

let previewRoot = '';
const previewFiles = new Map<string, string>();
let cropAnalysisQueue = Promise.resolve();

const scheduleCropAnalysis = (task: () => Promise<string | null>) => {
  const next = cropAnalysisQueue.then(task, task);
  cropAnalysisQueue = next.then(() => undefined, () => undefined);
  return next;
};

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
  hardwareArgs: string[] = [],
) => {
  const id = crypto.randomUUID();
  const outputPath = path.join(getPreviewRoot(), `${id}.jpg`);
  const seek = Math.max(0, (duration ?? 0) * 0.35);
  const makeArgs = (args: string[], useCuda: boolean) => [
    '-hide_banner', '-loglevel', 'error', ...args, '-ss', seek.toFixed(3), '-i', sourcePath,
    '-frames:v', '1', '-vf', useCuda
      ? 'scale_cuda=w=-2:h=320:format=nv12,hwdownload,format=nv12'
      : 'scale=-2:320',
    '-q:v', '3', '-y', outputPath,
  ];
  try { await execute(ffmpegPath, makeArgs(hardwareArgs, hardwareArgs.length > 0)); }
  catch (error) {
    if (!hardwareArgs.length) throw error;
    await execute(ffmpegPath, makeArgs([], false));
  }
  const data = await fs.promises.readFile(outputPath);
  previewFiles.set(id, outputPath);
  return { previewId: id, previewDataUrl: `data:image/jpeg;base64,${data.toString('base64')}` };
};

const detectCrop = async (
  ffmpegPath: string,
  sourcePath: string,
  duration: number | null,
  width: number,
  height: number,
  pixelFormat: string,
  hardwareArgs: string[] = [],
) => {
  const sampleCount = APP_CONFIG.videoFilters.autoCropSamples;
  const framesPerSample = APP_CONFIG.videoFilters.autoCropFrames;
  const softwareFormat = /10|p010/i.test(pixelFormat) ? 'p010le' : 'nv12';
  const seeks = duration && duration > 1
    ? Array.from({ length: sampleCount }, (_item, index) => duration * (index + 1) / (sampleCount + 1))
    : [0];
  const samples = await Promise.all(seeks.map(async (seek) => {
    const makeArgs = (args: string[], useCuda: boolean) => [
      '-hide_banner', ...args, '-ss', Math.max(0, seek).toFixed(3), '-i', sourcePath,
      '-frames:v', String(framesPerSample), '-vf', useCuda
        ? `hwdownload,format=${softwareFormat},cropdetect=limit=24:round=2:reset=0`
        : 'cropdetect=limit=24:round=2:reset=0',
      '-an', '-f', 'null', '-',
    ];
    let output: string;
    try { output = await execute(ffmpegPath, makeArgs(hardwareArgs, hardwareArgs.length > 0)); }
    catch (error) {
      if (!hardwareArgs.length) throw error;
      output = await execute(ffmpegPath, makeArgs([], false));
    }
    const matches = [...output.matchAll(/crop=(\d+:\d+:\d+:\d+)/g)].map((match) => match[1]);
    const counts = new Map<string, number>();
    matches.forEach((crop) => counts.set(crop, (counts.get(crop) ?? 0) + 1));
    return [...counts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? null;
  }));
  return stableCropConsensus(samples, width, height);
};

export const analyzeVisual = async (
  ffmpegPath: string,
  sourcePath: string,
  media: MediaInfo,
  capabilities?: HardwareCapabilities | null,
  onCropDetected?: (suggestedCrop: string | null) => void,
) => {
  const video = media.video;
  const codecDecoders: Record<string, string> = {
    AVC: 'h264_cuvid', H264: 'h264_cuvid', HEVC: 'hevc_cuvid', H265: 'hevc_cuvid',
    AV1: 'av1_cuvid', VP9: 'vp9_cuvid', VP8: 'vp8_cuvid', MPEG2: 'mpeg2_cuvid',
    MPEG2VIDEO: 'mpeg2_cuvid', MPEG4: 'mpeg4_cuvid', VC1: 'vc1_cuvid', MJPEG: 'mjpeg_cuvid',
  };
  const decoder = codecDecoders[video?.codec.toUpperCase() ?? ''];
  const hardwareArgs = capabilities?.cudaAvailable && capabilities.nvdecAvailable
    ? [
      '-init_hw_device', 'cuda=cu:0', '-filter_hw_device', 'cu', '-hwaccel', 'cuda',
      '-hwaccel_output_format', 'cuda',
      ...(decoder && capabilities.cuvidDecoders.includes(decoder) ? ['-c:v:0', decoder] : []),
      '-extra_hw_frames', '64',
    ]
    : [];
  void scheduleCropAnalysis(() => detectCrop(
      ffmpegPath, sourcePath, media.duration, video?.width ?? 0, video?.height ?? 0,
      video?.pixelFormat ?? '', hardwareArgs,
    )).then((suggestedCrop) => {
      media.suggestedCrop = suggestedCrop;
      onCropDetected?.(suggestedCrop);
    }).catch(() => {
      media.suggestedCrop = null;
      onCropDetected?.(null);
    });
  const preview = await createThumbnail(ffmpegPath, sourcePath, media.duration, hardwareArgs).catch(() => ({}));
  return { ...preview, cropAnalysisPending: true };
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
