import type { AudioStreamInfo } from './shared-types';
import { APP_CONFIG } from './config.ts';

// Feishin's Default compressor preset, converted from dB values to the
// linear threshold and makeup values expected by FFmpeg's acompressor.
export const FEISHIN_DEFAULT_COMPRESSOR_FILTER = APP_CONFIG.audioFilters.compressor;
export const AUDIO_PEAK_LIMITER_FILTER = APP_CONFIG.audioFilters.peakLimiter;

const timestampResampleFilter = (resampleTo48k: boolean) =>
  APP_CONFIG.audioFilters.timestampResample.replace('{rate_prefix}', resampleTo48k ? '48000:' : '');

export const surroundDownmixFilter = (
  track: Pick<AudioStreamInfo, 'channels' | 'channelLayout'>,
  dynamicRangeCompression: boolean,
) => {
  let downmix: string | null = null;
  if (track.channels >= 8 || /^7\.1/i.test(track.channelLayout)) {
    downmix = APP_CONFIG.audioFilters.downmix71;
  } else if (track.channels >= 6 || /^5\.1/i.test(track.channelLayout)) {
    downmix = APP_CONFIG.audioFilters.downmix51;
  } else if (track.channels > 2) {
    downmix = APP_CONFIG.audioFilters.downmixSurround;
  }
  if (!downmix) return null;
  return dynamicRangeCompression
    ? `${downmix},${APP_CONFIG.audioFilters.compressor},${AUDIO_PEAK_LIMITER_FILTER}`
    : downmix;
};

export const encodedAudioFilter = (
  track: Pick<AudioStreamInfo, 'channels' | 'channelLayout'>,
  downmixToStereo: boolean,
  dynamicRangeCompression: boolean,
  resampleTo48k: boolean,
) => [
  timestampResampleFilter(resampleTo48k),
  downmixToStereo ? surroundDownmixFilter(track, dynamicRangeCompression) : null,
].filter((filter): filter is string => Boolean(filter)).join(',');
