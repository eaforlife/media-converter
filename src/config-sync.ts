const normalizedLines = (contents: string) => contents.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');

const managedCacheStart = (lines: readonly string[]) =>
  lines.findIndex((line) => line.trim() === '[System Capability Cache]');

const contentBeforeCache = (contents: string) => {
  const lines = normalizedLines(contents);
  const start = managedCacheStart(lines);
  return (start < 0 ? lines : lines.slice(0, start)).join('\n').trimEnd();
};

export const configSourceContentsMatch = (left: string, right: string) =>
  contentBeforeCache(left) === contentBeforeCache(right);

/** Take source defaults and keep the active install's hardware cache verbatim. */
export const replaceConfigContentBeforeCache = (source: string, installed: string) => {
  const sourceLines = normalizedLines(source);
  const installedLines = normalizedLines(installed);
  const sourceCacheStart = managedCacheStart(sourceLines);
  const installedCacheStart = managedCacheStart(installedLines);
  const sourcePrefix = sourceCacheStart < 0 ? sourceLines : sourceLines.slice(0, sourceCacheStart);
  const installedCache = installedCacheStart < 0 ? [] : installedLines.slice(installedCacheStart);
  while (sourcePrefix.length && !sourcePrefix.at(-1)?.trim()) sourcePrefix.pop();
  return `${sourcePrefix.join('\n')}${installedCache.length ? `\n\n${installedCache.join('\n').replace(/\n+$/, '')}` : ''}\n`;
};

export const setConfigAppVersion = (contents: string, version: string) => {
  const lines = normalizedLines(contents);
  const header = /^\s*\[App Version: [^\]]+\]\s*$/;
  const index = lines.findIndex((line) => header.test(line));
  if (index >= 0) lines[index] = `[App Version: ${version}]`;
  else lines.unshift(`[App Version: ${version}]`, '');
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
};
