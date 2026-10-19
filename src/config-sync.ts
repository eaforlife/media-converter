const normalizedLines = (contents: string) => contents.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');

const managedSections = new Set(['System Capability Cache', 'Personalized Defaults']);
const sectionName = (line: string) => /^\s*\[([^\]]+)\]\s*$/.exec(line)?.[1];
const managedSectionRanges = (lines: readonly string[]) => lines.flatMap((line, index) => {
  const name = sectionName(line);
  if (!name || !managedSections.has(name)) return [];
  const next = lines.findIndex((candidate, candidateIndex) => candidateIndex > index && sectionName(candidate) !== undefined);
  return [{ start: index, end: next < 0 ? lines.length : next }];
});

const withoutManagedSections = (contents: string) => {
  const lines = normalizedLines(contents);
  const ranges = managedSectionRanges(lines);
  return lines.filter((_, index) => !ranges.some(({ start, end }) => index >= start && index < end)).join('\n').trimEnd();
};

export const configSourceContentsMatch = (left: string, right: string) =>
  withoutManagedSections(left) === withoutManagedSections(right);

/** Take source defaults and keep user settings and hardware cache verbatim. */
export const replaceConfigContentBeforeCache = (source: string, installed: string) => {
  const sourceLines = normalizedLines(source);
  const installedLines = normalizedLines(installed);
  const retained = managedSectionRanges(installedLines).map(({ start, end }) => installedLines.slice(start, end).join('\n').replace(/\n+$/, ''));
  const sourceRanges = managedSectionRanges(sourceLines);
  const sourceDefaults = sourceLines.filter((_, index) => !sourceRanges.some(({ start, end }) => index >= start && index < end));
  while (sourceDefaults.length && !sourceDefaults.at(-1)?.trim()) sourceDefaults.pop();
  return `${sourceDefaults.join('\n')}${retained.length ? `\n\n${retained.join('\n\n')}` : ''}\n`;
};

export const removeSystemCapabilityCache = (contents: string) => {
  const lines = normalizedLines(contents);
  const start = lines.findIndex((line) => line.trim() === '[System Capability Cache]');
  if (start < 0) return contents;
  const next = lines.findIndex((line, index) => index > start && /^\s*\[[^\]]+\]\s*$/.test(line));
  lines.splice(start, (next < 0 ? lines.length : next) - start);
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  return `${lines.join('\n')}\n`;
};

export const setConfigAppVersion = (contents: string, version: string) => {
  const lines = normalizedLines(contents);
  const header = /^\s*\[App Version: [^\]]+\]\s*$/;
  const index = lines.findIndex((line) => header.test(line));
  if (index >= 0) lines[index] = `[App Version: ${version}]`;
  else lines.unshift(`[App Version: ${version}]`, '');
  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
};
