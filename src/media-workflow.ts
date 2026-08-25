import type { MediaInfo, MediaWorkflow, VideoStreamInfo } from './shared-types';
import type { PreferredVideoCodec } from './presets';

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

export const musicVideoEncoderProfile = (
  outputCodec: PreferredVideoCodec,
  main10Output: boolean,
) => outputCodec === 'H.264' ? 'high' : outputCodec === 'HEVC' && main10Output ? 'main10' : null;
