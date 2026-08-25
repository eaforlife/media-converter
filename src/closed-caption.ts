export type ClosedCaptionCodec = 'mov_text' | 'subrip' | 'webvtt';

const nextSubtitleIndex = (args: string[]) => {
  const indexes = args.flatMap((argument) => {
    const match = argument.match(/^-c:s:(\d+)$/);
    return match ? [Number(match[1])] : [];
  });
  return indexes.length ? Math.max(...indexes) + 1 : 0;
};

export const ccextractorArguments = (sourcePath: string, outputPath: string) => [
  sourcePath,
  '--out=srt',
  '-o', outputPath,
];

export const injectClosedCaptionInput = (
  args: string[],
  sourcePath: string,
  subtitlePath: string,
  codec: ClosedCaptionCodec,
) => {
  const sourceIndex = args.indexOf(sourcePath);
  if (sourceIndex < 0 || args.length < 1) {
    throw new Error('Unable to add extracted captions to the FFmpeg command');
  }
  const subtitleIndex = nextSubtitleIndex(args);
  const withInput = [
    ...args.slice(0, sourceIndex + 1),
    '-i', subtitlePath,
    ...args.slice(sourceIndex + 1, -1),
  ];
  return [
    ...withInput,
    '-map', '1:0',
    `-c:s:${subtitleIndex}`, codec,
    `-metadata:s:s:${subtitleIndex}`, 'language=und',
    `-metadata:s:s:${subtitleIndex}`, 'title=Closed Captions',
    `-disposition:s:${subtitleIndex}`, 'hearing_impaired',
    args.at(-1) as string,
  ];
};
