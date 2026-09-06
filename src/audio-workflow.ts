import type { AudioStreamInfo } from './shared-types';
import { APP_CONFIG } from './config.ts';

export type AudioPresetName = 'Streaming' | 'Archive' | 'Passthrough';

export const MUSIC_VIDEO_AAC_BITRATE = APP_CONFIG.audioFilters.musicVideoAacBitrate;

export const AUDIO_PRESET_NAMES: readonly AudioPresetName[] = ['Streaming', 'Archive', 'Passthrough'];

export const AUDIO_PRESETS = new Proxy(APP_CONFIG.audioPresets, {
  get: (_target, property: AudioPresetName) => APP_CONFIG.audioPresets[property],
});

export const audioBitrate = (preset: AudioPresetName, track: AudioStreamInfo, downmix: boolean) => {
  const definition = AUDIO_PRESETS[preset];
  return downmix && !track.isStereo ? definition.downmixBitrate : definition.stereoBitrate;
};

export const shouldResampleLossless = (track: AudioStreamInfo, enabled: boolean) =>
  enabled && track.isLossless && (track.sampleRate ?? 0) > 48_000;

export const rsgainArguments = (root: string) => ['easy', '-m', 'MAX', '-S', root];

export const successfulNormalizationRoots = (
  jobs: ReadonlyArray<{ normalizeRoot?: string }>,
  queueSucceeded: boolean,
) => queueSucceeded
  ? [...new Set(jobs.flatMap((job) => job.normalizeRoot ? [job.normalizeRoot] : []))]
  : [];
