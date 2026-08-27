import path from 'node:path';
import { mediaLanguageName, normalizeMediaLanguage } from './media-language.ts';
import type { SubtitleStreamInfo } from './shared-types.ts';

const LANGUAGE_TOKEN = /^[a-z]{2,3}$/i;
const FLAG_TOKENS = new Set(['default', 'forced', 'sdh']);

export const externalSubtitleTracks = (
  videoPath: string,
  subtitlePaths: readonly string[],
  firstIndex: number,
): SubtitleStreamInfo[] => {
  const videoBase = path.parse(videoPath).name;
  const normalizedVideoBase = videoBase.toLocaleLowerCase();
  return subtitlePaths.flatMap((subtitlePath) => {
    const parsed = path.parse(subtitlePath);
    if (parsed.ext.toLocaleLowerCase() !== '.srt') return [];
    const normalizedSubtitleBase = parsed.name.toLocaleLowerCase();
    if (!normalizedSubtitleBase.startsWith(`${normalizedVideoBase}.`)) return [];
    const tokens = parsed.name.slice(videoBase.length + 1).split('.').filter(Boolean);
    const languageTokens = tokens.filter((token) => LANGUAGE_TOKEN.test(token) && !FLAG_TOKENS.has(token.toLocaleLowerCase()));
    if (languageTokens.length > 1 || tokens.some((token) => {
      const normalized = token.toLocaleLowerCase();
      return !FLAG_TOKENS.has(normalized) && !LANGUAGE_TOKEN.test(token);
    })) return [];
    const language = normalizeMediaLanguage(languageTokens[0]);
    const normalizedTokens = new Set(tokens.map((token) => token.toLocaleLowerCase()));
    return [{
      index: firstIndex,
      codec: 'subrip',
      codecLabel: 'External SubRip (SRT)',
      language,
      languageLabel: mediaLanguageName(language),
      kind: 'text' as const,
      isUtf8: true,
      flags: {
        default: normalizedTokens.has('default'),
        forced: normalizedTokens.has('forced'),
        hearingImpaired: normalizedTokens.has('sdh'),
      },
      externalPath: subtitlePath,
    }];
  }).map((track, offset) => ({ ...track, index: firstIndex + offset }));
};

export const externalSubtitleInputArguments = (tracks: readonly SubtitleStreamInfo[]) =>
  tracks.flatMap((track) => track.externalPath ? ['-i', track.externalPath] : []);

export const subtitleInputSpecifier = (track: SubtitleStreamInfo, tracks: readonly SubtitleStreamInfo[]) => {
  if (!track.externalPath) return `0:${track.index}`;
  const externalIndex = tracks.filter((candidate) => candidate.externalPath).findIndex(
    (candidate) => candidate.externalPath === track.externalPath,
  );
  if (externalIndex < 0) throw new Error('External subtitle input is missing');
  return `${externalIndex + 1}:0`;
};
