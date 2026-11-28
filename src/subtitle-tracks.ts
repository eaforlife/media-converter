import type { StreamFlags, SubtitleKind } from './shared-types.ts';

export const subtitleStreamFlags = (
  flags: StreamFlags,
  tags: Record<string, string | undefined> = {},
): StreamFlags => {
  const description = Object.entries(tags)
    .filter(([name]) => ['title', 'description', 'handler_name', 'comment'].includes(name.toLowerCase()))
    .map(([, value]) => value ?? '')
    .join(' ');
  const hearingImpairedLabel = /(?:^|[^a-z0-9])(?:sdh|hearing[\s_-]+impaired)(?=$|[^a-z0-9])/i.test(description);
  return { ...flags, hearingImpaired: flags.hearingImpaired || hearingImpairedLabel };
};

type TrackIdentity = { language: string; flags: StreamFlags };

export const matchMetadataTrack = <T extends TrackIdentity>(
  origin: T,
  edited: TrackIdentity,
  candidates: T[],
  position: number,
  channels?: (track: T) => number,
) => candidates.map((track, candidatePosition) => ({
  track,
  score: (track.language === origin.language ? 100 : 0)
    + (track.language === edited.language ? 25 : 0)
    + (track.flags.default === origin.flags.default ? 20 : 0)
    + (track.flags.forced === origin.flags.forced ? 20 : 0)
    + (track.flags.hearingImpaired === origin.flags.hearingImpaired ? 30 : 0)
    + (channels && channels(track) === (channels(origin) ?? -1) ? 30 : 0)
    + (candidatePosition === position ? 1 : 0),
})).sort((left, right) => right.score - left.score)[0]?.track;

export const matchSubtitleMetadataTrack = <T extends TrackIdentity>(
  origin: T,
  candidates: T[],
) => candidates.find((track) => track.language === origin.language
  && track.flags.hearingImpaired === origin.flags.hearingImpaired);

type IndexedTrack = TrackIdentity & { index: number };

export const matchingTrackIndex = <T extends IndexedTrack>(
  originTracks: T[],
  targetTracks: T[],
  targetIndex: number,
  matchSubtitleIdentity = false,
) => {
  const target = targetTracks.find((track) => track.index === targetIndex);
  if (!target) return null;
  const originCandidates = originTracks.filter((track) => track.language === target.language);
  if (!originCandidates.length) return null;
  if (!matchSubtitleIdentity) {
    return originCandidates.map((track) => {
      const originPosition = originCandidates.findIndex((item) => item.index === track.index);
      const targetCandidates = targetTracks.filter((track) => track.language === target.language);
      const targetPosition = targetCandidates.findIndex((track) => track.index === targetIndex);
      const matchingFlags = Number(track.flags.default === target.flags.default)
        + Number(track.flags.forced === target.flags.forced)
        + Number(track.flags.hearingImpaired === target.flags.hearingImpaired);
      return { track, score: matchingFlags * 20 - Math.abs(originPosition - targetPosition) };
    }).sort((left, right) => right.score - left.score)[0]?.track.index ?? null;
  }
  const sdhCandidates = originCandidates.filter((track) =>
    track.flags.hearingImpaired === target.flags.hearingImpaired);
  if (!sdhCandidates.length) return null;
  const targetCandidates = targetTracks.filter((track) => track.language === target.language
    && track.flags.hearingImpaired === target.flags.hearingImpaired);
  const targetPosition = targetCandidates.findIndex((track) => track.index === targetIndex);
  return sdhCandidates.map((track) => {
    const originPosition = sdhCandidates.findIndex((item) => item.index === track.index);
    return { track, score: -Math.abs(originPosition - targetPosition) };
  }).sort((left, right) => right.score - left.score)[0]?.track.index ?? null;
};

export const subtitleTracksInSourceOrder = <T extends { index: number; kind: SubtitleKind }>(
  tracks: T[],
  settings: Record<number, { enabled: boolean }>,
  isSupported: (track: T) => boolean = () => true,
  shouldExclude: (track: T) => boolean = () => false,
) => tracks.filter((track) => settings[track.index]?.enabled && isSupported(track) && !shouldExclude(track));
