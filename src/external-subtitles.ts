import path from 'node:path';
import { mediaLanguageName, normalizeMediaLanguage } from './media-language.ts';
import type { SubtitleStreamInfo } from './shared-types.ts';

const LANGUAGE_TOKEN = /^[a-z]{2,3}$/i;
const FLAG_TOKENS = new Set(['default', 'forced', 'sdh']);
const SUBTITLE_FORMATS: Readonly<Record<string, { codec: string; label: string }>> = {
  '.ass': { codec: 'ass', label: 'External Advanced SubStation Alpha (ASS)' },
  '.srt': { codec: 'subrip', label: 'External SubRip (SRT)' },
  '.ssa': { codec: 'ass', label: 'External SubStation Alpha (SSA)' },
  '.vtt': { codec: 'webvtt', label: 'External WebVTT' },
};

export const UTF8_SUBTITLE_EXTENSIONS = Object.freeze(Object.keys(SUBTITLE_FORMATS));

export const isSupportedExternalSubtitle = (subtitlePath: string) =>
  Boolean(SUBTITLE_FORMATS[path.extname(subtitlePath).toLocaleLowerCase()]);

export const isUtf8SubtitleData = (data: Uint8Array) => {
  if (!data.length) return false;
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(data);
    return true;
  } catch {
    return false;
  }
};

const matchingFilenameTokens = (videoPath: string, subtitlePath: string) => {
  if (path.resolve(path.dirname(videoPath)).toLocaleLowerCase()
    !== path.resolve(path.dirname(subtitlePath)).toLocaleLowerCase()) return null;
  const videoBase = path.parse(videoPath).name;
  const subtitleBase = path.parse(subtitlePath).name;
  if (subtitleBase.toLocaleLowerCase() === videoBase.toLocaleLowerCase()) return [];
  if (!subtitleBase.toLocaleLowerCase().startsWith(`${videoBase.toLocaleLowerCase()}.`)) return null;
  const tokens = subtitleBase.slice(videoBase.length + 1).split('.').filter(Boolean);
  const languageTokens = tokens.filter((token) => LANGUAGE_TOKEN.test(token)
    && !FLAG_TOKENS.has(token.toLocaleLowerCase()));
  if (languageTokens.length > 1 || tokens.some((token) => {
    const normalized = token.toLocaleLowerCase();
    return !FLAG_TOKENS.has(normalized) && !LANGUAGE_TOKEN.test(token);
  })) return null;
  return tokens;
};

const externalSubtitleTrack = (
  subtitlePath: string,
  index: number,
  tokens: readonly string[],
): SubtitleStreamInfo => {
  const format = SUBTITLE_FORMATS[path.extname(subtitlePath).toLocaleLowerCase()];
  const normalizedTokens = new Set(tokens.map((token) => token.toLocaleLowerCase()));
  const languageToken = tokens.find((token) => LANGUAGE_TOKEN.test(token)
    && !FLAG_TOKENS.has(token.toLocaleLowerCase()));
  const language = normalizeMediaLanguage(languageToken);
  return {
    index,
    codec: format.codec,
    codecLabel: format.label,
    language,
    languageLabel: mediaLanguageName(language),
    kind: 'text',
    isUtf8: true,
    flags: {
      default: normalizedTokens.has('default'),
      forced: normalizedTokens.has('forced'),
      hearingImpaired: normalizedTokens.has('sdh'),
    },
    externalPath: subtitlePath,
  };
};

export const externalSubtitleTracks = (
  videoPath: string,
  subtitlePaths: readonly string[],
  firstIndex: number,
): SubtitleStreamInfo[] => {
  return subtitlePaths.flatMap((subtitlePath) => {
    if (!isSupportedExternalSubtitle(subtitlePath)) return [];
    const tokens = matchingFilenameTokens(videoPath, subtitlePath);
    return tokens ? [externalSubtitleTrack(subtitlePath, firstIndex, tokens)] : [];
  }).map((track, offset) => ({ ...track, index: firstIndex + offset }));
};

export const importedSubtitleTracks = (
  videoPath: string,
  subtitlePaths: readonly string[],
  firstIndex: number,
) => subtitlePaths.filter(isSupportedExternalSubtitle).map((subtitlePath, offset) =>
  externalSubtitleTrack(subtitlePath, firstIndex + offset, matchingFilenameTokens(videoPath, subtitlePath) ?? []));

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
