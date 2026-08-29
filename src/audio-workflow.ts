import type { AudioStreamInfo } from './shared-types';

export type AudioPresetName = 'Streaming' | 'Archive' | 'Passthrough';

export const MUSIC_VIDEO_AAC_BITRATE = '224k';

export const AUDIO_PRESET_NAMES: readonly AudioPresetName[] = ['Streaming', 'Archive', 'Passthrough'];

export const AUDIO_PRESETS = Object.freeze({
  Streaming: Object.freeze({ codec: 'libopus' as const, extension: 'opus', stereoBitrate: '96k', downmixBitrate: '128k', dynamicRangeCompression: true }),
  Archive: Object.freeze({ codec: 'libfdk_aac' as const, extension: 'm4a', stereoBitrate: '224k', downmixBitrate: '256k', dynamicRangeCompression: false }),
  Passthrough: Object.freeze({ codec: 'copy' as const, extension: null, stereoBitrate: '', downmixBitrate: '', dynamicRangeCompression: false }),
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
