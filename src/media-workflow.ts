import type { MediaInfo, MediaWorkflow } from './shared-types';

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
