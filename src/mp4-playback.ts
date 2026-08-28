import type { PreferredVideoCodec } from './presets';

export const MP4_KEYFRAME_INTERVAL_SECONDS = 5;

export const mp4PlaybackArguments = (
  transcodedVideoCodec: PreferredVideoCodec | null,
) => [
  ...(transcodedVideoCodec
    ? ['-force_key_frames:v:0', `expr:gte(t,n_forced*${MP4_KEYFRAME_INTERVAL_SECONDS})`]
    : []),
  ...(transcodedVideoCodec === 'HEVC' ? ['-tag:v:0', 'hvc1'] : []),
  '-movflags', '+faststart',
];
