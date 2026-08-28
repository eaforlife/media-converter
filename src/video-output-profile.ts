import type { ScaleMode } from './shared-types';

export type OutputTier = '4k' | '1080p' | '720p' | '360p';

export type VideoOutputProfile = {
  tier: OutputTier;
  scale: readonly [string, string];
  videoBitrate: number;
  maxRate: number;
};
export type VideoOutputProfiles = Readonly<Record<OutputTier, VideoOutputProfile>>;

export const sourceOutputTier = (height: number): OutputTier => {
  if (height > 1440) return '4k';
  if (height > 720) return '1080p';
  if (height > 360 || height <= 0) return '720p';
  return '360p';
};

export const outputTierFor = (height: number, scale: ScaleMode, cellular = false): OutputTier => {
  if (cellular || scale === '360p') return '360p';
  if (scale === '1080p' || scale === '720p') return scale;
  return sourceOutputTier(height);
};

export const videoOutputProfile = (
  height: number,
  scale: ScaleMode,
  profiles: VideoOutputProfiles,
  cellular = false,
) => profiles[outputTierFor(height, scale, cellular)];

export const scaleDimensionsFor = (
  height: number,
  scale: ScaleMode,
  profiles: VideoOutputProfiles,
  cellular = false,
): readonly [string, string] | null => scale === 'disabled'
  ? null
  : videoOutputProfile(height, scale, profiles, cellular).scale;

export const bufferSizeFor = (maxRate: number, multiplier: number) =>
  Math.max(0, maxRate) * Math.max(0, multiplier);
