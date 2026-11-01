export type ClosedCaptionCodec = 'mov_text' | 'subrip' | 'webvtt';

export const isCeaCaptionStream = (track: { codec: string }) =>
  ['eia_608', 'eia_708'].includes(track.codec.toLocaleLowerCase());

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
  '--no-progress-bar',
  '-o', outputPath,
];

export const injectClosedCaptionInput = (
  args: string[],
  sourcePath: string,
  subtitlePath: string,
  codec: ClosedCaptionCodec,
  metadata: { language: string; flags: { default: boolean; forced: boolean; hearingImpaired: boolean } } = {
    language: 'und', flags: { default: false, forced: false, hearingImpaired: false },
  },
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
    `-metadata:s:s:${subtitleIndex}`, `language=${metadata.language}`,
    `-metadata:s:s:${subtitleIndex}`, 'title=Closed Captions',
    `-disposition:s:${subtitleIndex}`, [
      ...(metadata.flags.default ? ['default'] : []),
      ...(metadata.flags.forced ? ['forced'] : []),
      ...(metadata.flags.hearingImpaired ? ['hearing_impaired'] : []),
    ].join('+') || '0',
    args.at(-1) as string,
  ];
};
