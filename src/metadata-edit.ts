import type { StreamFlags } from './shared-types';

export type EditableStreamMetadata = {
  language: string;
  flags: StreamFlags;
};

export type StreamMetadataPatch = {
  language?: string;
  flags?: Partial<StreamFlags>;
};

export const streamMetadataPatch = (
  source: EditableStreamMetadata,
  edited: EditableStreamMetadata,
): StreamMetadataPatch | null => {
  const flags: Partial<StreamFlags> = {};
  for (const flag of ['default', 'forced', 'hearingImpaired'] as const) {
    if (source.flags[flag] !== edited.flags[flag]) flags[flag] = edited.flags[flag];
  }
  const patch: StreamMetadataPatch = {};
  if (source.language !== edited.language) patch.language = edited.language;
  if (Object.keys(flags).length) patch.flags = flags;
  return Object.keys(patch).length ? patch : null;
};

export const applyStreamMetadataPatch = (
  target: EditableStreamMetadata,
  patch: StreamMetadataPatch | null,
) => {
  if (!patch) return false;
  let changed = false;
  if (patch.language !== undefined && target.language !== patch.language) {
    target.language = patch.language;
    changed = true;
  }
  for (const [flag, value] of Object.entries(patch.flags ?? {}) as Array<[keyof StreamFlags, boolean]>) {
    if (target.flags[flag] === value) continue;
    target.flags[flag] = value;
    changed = true;
  }
  return changed;
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
