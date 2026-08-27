import type { ScaleMode } from './shared-types';

export type OutputTier = '4k' | '1080p' | '720p' | '360p';

export type VideoOutputProfile = {
  tier: OutputTier;
  scale: readonly [string, string];
  maxRate: number;
};

export const VIDEO_OUTPUT_PROFILES: Readonly<Record<OutputTier, VideoOutputProfile>> = Object.freeze({
  '4k': Object.freeze({ tier: '4k', scale: ['2720', '-2'] as const, maxRate: 8000 }),
  '1080p': Object.freeze({ tier: '1080p', scale: ['1760', '-2'] as const, maxRate: 5000 }),
  '720p': Object.freeze({ tier: '720p', scale: ['1320', '-2'] as const, maxRate: 2500 }),
  '360p': Object.freeze({ tier: '360p', scale: ['720', '-2'] as const, maxRate: 2500 }),
});

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

export const videoOutputProfile = (height: number, scale: ScaleMode, cellular = false) =>
  VIDEO_OUTPUT_PROFILES[outputTierFor(height, scale, cellular)];

export const scaleDimensionsFor = (
  height: number,
  scale: ScaleMode,
  cellular = false,
): readonly [string, string] | null => scale === 'disabled'
  ? null
  : videoOutputProfile(height, scale, cellular).scale;

export const deliveryPresetForOutput = (preset: string, tier: OutputTier) =>
  preset === 'Streaming' && tier === '360p' ? 'Cellular' : preset;

export const deliveryQualityForOutput = (preset: string, tier: OutputTier, fallback: string) =>
  preset === 'Streaming' && tier === '1080p'
    ? String(Math.max(12, Number(fallback) - 1))
    : fallback;

export const bufferSizeFor = (maxRate: number, multiplier: number) =>
  Math.max(0, maxRate) * Math.max(0, multiplier);
