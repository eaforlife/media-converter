const VERSION_HEADER = /^\[Version:\s*(\d+)\.(\d+)(?:\.(\d+))?\]$/i;

export const iniVersion = (contents: string): string | null => {
  const firstEntry = contents.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
  const match = VERSION_HEADER.exec(firstEntry);
  return match ? `${Number(match[1])}.${Number(match[2])}.${Number(match[3] ?? 0)}` : null;
};

export const compareIniVersions = (left: string | null, right: string | null): number | null => {
  if (!left || !right) return null;
  const a = left.split('.').map(Number);
  const b = right.split('.').map(Number);
  for (let index = 0; index < 3; index++) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0);
    if (difference !== 0) return difference;
  }
  return 0;
};

export const sourceIniIsNewer = (source: string, local: string): boolean => {
  const sourceVersion = iniVersion(source);
  if (!sourceVersion) return false;
  const localVersion = iniVersion(local);
  return localVersion === null || (compareIniVersions(sourceVersion, localVersion) ?? 1) > 0;
};
