import type { AudioStreamInfo } from './shared-types';

export type AudioPresetName = 'Streaming' | 'Archive' | 'Passthrough';

export const AUDIO_PRESET_NAMES: readonly AudioPresetName[] = ['Streaming', 'Archive', 'Passthrough'];

export const shouldResampleLossless = (track: AudioStreamInfo, enabled: boolean) =>
  enabled && track.isLossless && (track.sampleRate ?? 0) > 48_000;

export const rsgainArguments = (root: string) => ['easy', '-m', 'MAX', '-S', root];

export const successfulNormalizationRoots = (
  jobs: ReadonlyArray<{ normalizeRoot?: string }>,
  queueSucceeded: boolean,
) => queueSucceeded
  ? [...new Set(jobs.flatMap((job) => job.normalizeRoot ? [job.normalizeRoot] : []))]
  : [];
