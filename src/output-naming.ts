export const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '');

export const preservedOutputBaseName = (name: string) => stripExtension(name);

const normalizeTitle = (value: string) => value
  .replace(/[._]+/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/^[\s-]+|[\s-]+$/g, '');

export type EpisodeIdentity = {
  showTitle: string;
  year: number | null;
  season: number;
  episode: number;
};

export const sanitizePathSegment = (value: string) => {
  let safe = Array.from(value, (character) => character.charCodeAt(0) < 32 ? ' ' : character).join('')
    .replaceAll('!', '')
    .replaceAll('[', ' ')
    .replaceAll(']', ' ')
    .replace(/[<>:"/\\|?*]/g, ' ');
  safe = normalizeTitle(safe).replace(/[. ]+$/g, '').slice(0, 120).trim();
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(safe)) safe = `_${safe}`;
  return safe || 'Untitled';
};

export const parseEpisodeIdentity = (name: string): EpisodeIdentity | null => {
  const original = stripExtension(name);
  const episode = /(?:^|[ ._-])S(\d{1,2})[ ._-]*E(\d{1,3})(?=$|[ ._-])/i.exec(original)
    ?? /(?:^|[ ._-])(\d{1,2})x(\d{1,3})(?=$|[ ._-])/i.exec(original);
  if (!episode || episode.index === undefined) return null;

  const prefix = original.slice(0, episode.index);
  const yearMatch = /(?:^|[ ._(-])((?:19|20)\d{2})\)?$/i.exec(prefix);
  const showSource = yearMatch?.index === undefined ? prefix : prefix.slice(0, yearMatch.index);
  const showTitle = sanitizePathSegment(showSource);
  if (!showTitle) return null;

  return {
    showTitle,
    year: yearMatch ? Number(yearMatch[1]) : null,
    season: Number(episode[1]),
    episode: Number(episode[2]),
  };
};

export const smartSeriesBaseName = (name: string) => {
  const identity = parseEpisodeIdentity(name);
  if (!identity) return sanitizePathSegment(stripExtension(name));
  return `${identity.showTitle} S${String(identity.season).padStart(2, '0')}E${String(identity.episode).padStart(2, '0')}`;
};

export const commonSeriesFolderName = (names: readonly string[]) => {
  if (!names.length) return null;
  const identities = names.map(parseEpisodeIdentity);
  if (identities.some((identity) => identity === null)) return null;
  const parsed = identities.filter((identity): identity is EpisodeIdentity => identity !== null);
  const normalizedTitle = parsed[0].showTitle.toLocaleLowerCase();
  if (parsed.some((identity) => identity.showTitle.toLocaleLowerCase() !== normalizedTitle)) return null;
  const years = [...new Set(parsed.flatMap((identity) => identity.year === null ? [] : [identity.year]))];
  if (years.length > 1) return null;
  return sanitizePathSegment(`${parsed[0].showTitle}${years[0] ? ` (${years[0]})` : ''}`);
};
