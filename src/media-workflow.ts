import type { MediaInfo, MediaWorkflow, VideoStreamInfo } from './shared-types';
import type { PreferredVideoCodec, PresetFrameRate } from './presets';

export const NTSC_FILM_FRAME_RATE = '24000/1001';
export const FRAME_RATE_MATCH_TOLERANCE = 0.01;

const numericFrameRate = (frameRate: string | null | undefined) => {
  const parsed = Number.parseFloat(frameRate ?? '');
  return Number.isFinite(parsed) ? parsed : null;
};

export const frameRateOverrideState = (
  sourceFrameRate: string | null | undefined,
  configuredFrameRate: PresetFrameRate,
) => {
  const sourceRate = numericFrameRate(sourceFrameRate);
  if (configuredFrameRate === 'passthrough' || sourceRate === null) {
    return { enabled: false, disabled: true };
  }
  if (sourceRate < configuredFrameRate - FRAME_RATE_MATCH_TOLERANCE) {
    return { enabled: false, disabled: true };
  }
  if (Math.abs(sourceRate - configuredFrameRate) <= FRAME_RATE_MATCH_TOLERANCE) {
    return { enabled: false, disabled: false };
  }
  return { enabled: true, disabled: false };
};

export const frameRateConversionArguments = (
  sourceFrameRate: string | null | undefined,
  configuredFrameRate: PresetFrameRate,
) => {
  if (configuredFrameRate === 'passthrough') return [];
  const sourceRate = numericFrameRate(sourceFrameRate);
  if (sourceRate === null || sourceRate < configuredFrameRate - FRAME_RATE_MATCH_TOLERANCE) return [];
  const outputRate = Math.abs(configuredFrameRate - 23.976) < 0.0005
    ? NTSC_FILM_FRAME_RATE
    : String(configuredFrameRate);
  return ['-fps_mode:v:0', 'cfr', '-r:v:0', outputRate];
};

export const classifyMediaWorkflow = (media: MediaInfo): MediaWorkflow | null => {
  if (!media.video) return media.audio.length ? 'audio' : null;
  return media.duration !== null && media.duration < 8 * 60 && media.hasCoverArt
    ? 'music-video'
    : 'video';
};

export const attachedCoverArtArguments = (streamIndexes: readonly number[]) =>
  streamIndexes.flatMap((streamIndex, position) => {
    const outputIndex = position + 1;
    return [
      '-map', `0:${streamIndex}`,
      `-c:v:${outputIndex}`, 'copy',
      `-disposition:v:${outputIndex}`, 'attached_pic',
    ];
  });

export const isH264HighSource = (video: VideoStreamInfo | null | undefined) =>
  Boolean(video && /^(?:h\.?264|avc)$/i.test(video.codec.trim()) && /\bhigh\b/i.test(video.profile));

export const shouldDefaultToHevcMain10 = (video: VideoStreamInfo | null | undefined) =>
  Boolean(video && (video.isHevcMain10 || video.hasHdr || video.hasDolbyVision));

export const outputEncoderProfile = (
  outputCodec: PreferredVideoCodec,
  configuredProfile: string,
  main10Output: boolean,
) => outputCodec === 'HEVC' && main10Output ? 'main10' : configuredProfile || null;

export const musicVideoEncoderProfile = (
  outputCodec: PreferredVideoCodec,
  main10Output: boolean,
) => outputCodec === 'HEVC' && main10Output ? 'main10' : null;
