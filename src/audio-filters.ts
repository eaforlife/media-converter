import type { AudioStreamInfo } from './shared-types';

// Feishin's Default compressor preset, converted from dB values to the
// linear threshold and makeup values expected by FFmpeg's acompressor.
export const FEISHIN_DEFAULT_COMPRESSOR_FILTER = 'acompressor=threshold=0.063096:ratio=4:attack=20:release=250:makeup=1.995262:knee=2.83';
export const AUDIO_PEAK_LIMITER_FILTER = 'alimiter=limit=0.95:attack=5:release=50:latency=1';

const timestampResampleFilter = (resampleTo48k: boolean) =>
  `aresample=${resampleTo48k ? '48000:' : ''}async=1`;

export const surroundDownmixFilter = (
  track: Pick<AudioStreamInfo, 'channels' | 'channelLayout'>,
  dynamicRangeCompression: boolean,
) => {
  let downmix: string | null = null;
  if (track.channels >= 8 || /^7\.1/i.test(track.channelLayout)) {
    downmix = 'pan=stereo|c0<c0+0.707*c2+0.707*c4+0.707*c6|c1<c1+0.707*c2+0.707*c5+0.707*c7';
  } else if (track.channels >= 6 || /^5\.1/i.test(track.channelLayout)) {
    downmix = 'pan=stereo|c0<c0+0.707*c2+0.707*c4|c1<c1+0.707*c2+0.707*c5';
  } else if (track.channels > 2) {
    downmix = 'aformat=channel_layouts=stereo';
  }
  if (!downmix) return null;
  return dynamicRangeCompression
    ? `${downmix},${FEISHIN_DEFAULT_COMPRESSOR_FILTER},${AUDIO_PEAK_LIMITER_FILTER}`
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
