const stripExtension = (name: string) => name.replace(/\.[^.]+$/, '');

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
