import type { ScaleMode } from './shared-types';

export type BuiltInPresetName = 'Archive' | 'Regular' | 'Streaming' | 'Cellular';
export type PreferredVideoCodec = 'H.264' | 'HEVC' | 'AV1';
export type PresetAudioCodec = 'aac' | 'opus';
export type QualityFamily = 'nvenc' | 'amf' | 'qsv' | 'software';

type AudioRates = Record<PresetAudioCodec, { stereo: string; surround: string }>;

export type BuiltInPresetDefinition = {
  name: BuiltInPresetName;
  description: string;
  format: 'mp4' | 'mkv';
  preferredVideoCodec: PreferredVideoCodec;
  quality: Record<QualityFamily, string>;
  resolution: string;
  scale: ScaleMode;
  scaleLocked: boolean;
  deliveryMode: boolean;
  bitrateControl: boolean;
  bufferMultiplier: number;
  audioRates: AudioRates;
};

export const BUILT_IN_PRESETS: Readonly<Record<BuiltInPresetName, BuiltInPresetDefinition>> = Object.freeze({
  Archive: Object.freeze({
    name: 'Archive',
    description: 'Great for archival use where encoding speed does not matter.',
    format: 'mkv',
    preferredVideoCodec: 'H.264',
    quality: { nvenc: '18', amf: '18', qsv: '18', software: '18' },
    resolution: '-2:-2',
    scale: 'disabled',
    scaleLocked: false,
    deliveryMode: false,
    bitrateControl: false,
    bufferMultiplier: 0,
    audioRates: { aac: { stereo: '224k', surround: '320k' }, opus: { stereo: '96k', surround: '128k' } },
  }),
  Regular: Object.freeze({
    name: 'Regular',
    description: 'Encodes faster than Archive when maximum quality is less important.',
    format: 'mp4',
    preferredVideoCodec: 'HEVC',
    quality: { nvenc: '24', amf: '24', qsv: '24', software: '24' },
    resolution: '-2:-2',
    scale: 'disabled',
    scaleLocked: false,
    deliveryMode: false,
    bitrateControl: true,
    bufferMultiplier: 2,
    audioRates: { aac: { stereo: '224k', surround: '224k' }, opus: { stereo: '96k', surround: '128k' } },
  }),
  Streaming: Object.freeze({
    name: 'Streaming',
    description: 'Optimized for web streaming playback.',
    format: 'mp4',
    preferredVideoCodec: 'HEVC',
    quality: { nvenc: '29', amf: '29', qsv: '29', software: '29' },
    resolution: 'auto',
    scale: 'auto',
    scaleLocked: false,
    deliveryMode: true,
    bitrateControl: true,
    bufferMultiplier: 2,
    audioRates: { aac: { stereo: '144k', surround: '160k' }, opus: { stereo: '96k', surround: '128k' } },
  }),
  Cellular: Object.freeze({
    name: 'Cellular',
    description: 'Smaller files for limited-bandwidth playback.',
    format: 'mp4',
    preferredVideoCodec: 'HEVC',
    quality: { nvenc: '32', amf: '32', qsv: '32', software: '32' },
    resolution: '720:-2',
    scale: '360p',
    scaleLocked: true,
    deliveryMode: true,
    bitrateControl: true,
    bufferMultiplier: 2,
    audioRates: { aac: { stereo: '128k', surround: '128k' }, opus: { stereo: '64k', surround: '64k' } },
  }),
});

export const BUILT_IN_PRESET_NAMES = Object.freeze(Object.keys(BUILT_IN_PRESETS) as BuiltInPresetName[]);
