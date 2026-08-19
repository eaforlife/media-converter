import type { StreamFlags } from './shared-types';

export type EditableStreamMetadata = {
  language: string;
  flags: StreamFlags;
};

export const streamMetadataChanged = (
  source: EditableStreamMetadata,
  edited: EditableStreamMetadata,
) => source.language !== edited.language
  || source.flags.default !== edited.flags.default
  || source.flags.forced !== edited.flags.forced
  || source.flags.hearingImpaired !== edited.flags.hearingImpaired;

export const metadataTemporaryPath = (sourcePath: string, queueIndex: number) => {
  const separator = Math.max(sourcePath.lastIndexOf('/'), sourcePath.lastIndexOf('\\'));
  const dot = sourcePath.lastIndexOf('.');
  const extensionStart = dot > separator ? dot : sourcePath.length;
  const suffix = `_tmp${String(Math.max(0, queueIndex)).padStart(2, '0')}`;
  return `${sourcePath.slice(0, extensionStart)}${suffix}${sourcePath.slice(extensionStart)}`;
};
