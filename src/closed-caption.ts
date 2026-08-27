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
  const inputOptionIndexes = args.flatMap((argument, index) => argument === '-i' ? [index] : []);
  const lastInputPathIndex = inputOptionIndexes.at(-1);
  if (sourceIndex < 0 || lastInputPathIndex === undefined || args.length < 1) {
    throw new Error('Unable to add extracted captions to the FFmpeg command');
  }
  const subtitleIndex = nextSubtitleIndex(args);
  const captionInputIndex = inputOptionIndexes.length;
  const withInput = [
    ...args.slice(0, lastInputPathIndex + 2),
    '-i', subtitlePath,
    ...args.slice(lastInputPathIndex + 2, -1),
  ];
  return [
    ...withInput,
    '-map', `${captionInputIndex}:0`,
    `-c:s:${subtitleIndex}`, codec,
    `-metadata:s:s:${subtitleIndex}`, 'language=und',
    `-metadata:s:s:${subtitleIndex}`, 'title=Closed Captions',
    `-disposition:s:${subtitleIndex}`, 'hearing_impaired',
    args.at(-1) as string,
  ];
};
