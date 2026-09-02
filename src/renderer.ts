import './index.css';
import { APP_CODENAME } from './config';
import { encodedAudioFilter } from './audio-filters';
import { AUDIO_PRESETS, AUDIO_PRESET_NAMES, audioBitrate, shouldResampleLossless } from './audio-workflow';
import type { AudioPresetName } from './audio-workflow';
import {
  commonSeriesFolderName, parseEpisodeIdentity, preservedOutputBaseName, sanitizePathSegment,
  smartMovieFolderName, smartSeriesBaseName,
} from './output-naming';
import {
  predefinedPresetNames, preferredVideoCodecForPreset, REQUIRED_BUILT_IN_PRESET_NAMES,
  resolvePresetAdvancedVideo, resolvePresetOutputDefaults,
} from './presets';
import type { BuiltInPresetConfiguration, BuiltInPresetDefinition, BuiltInPresetName, EncoderFamily, PreferredVideoCodec, PresetAudioCodec, PresetFrameRate } from './presets';
import { advancedVideoArguments, supportedAdvancedVideoFields } from './advanced-video-settings';
import type { AdvancedVideoField } from './advanced-video-settings';
import {
  encoderBackendLabel, encoderSpeedArguments, encoderSpeedDisplay, encoderSpeedLabel, encoderTuneArguments, encoderTuneOptions,
  normalizeEncoderSpeed, normalizeEncoderTune, supportsEncoderSpeed,
} from './encoder-controls';
import type { EncoderSpeed } from './encoder-controls';
import { isValidCustomPresetName } from './custom-presets';
import { externalSubtitleInputArguments, subtitleInputSpecifier } from './external-subtitles';
import { aspectPreservingDimensions, cuvidCropMargins, detectedCrop } from './video-crop';
import {
  cudaCropBridgeFilters, cudaHardwareDecodeArguments, cudaScaleFilter, cuvidDecoderCropArguments, cuvidDecoderName, hardwareUploadFilter,
  protectedHardwareDecodeArguments, strictVideoTranscodeArguments,
} from './video-safety';
import { bufferSizeFor, scaleDimensionsFor, videoOutputProfile } from './video-output-profile';
import { applyEncodeProgress, canFinishEncodeQueue, createEncodeQueueProgress, isQueueTerminal } from './encode-progress-state';
import type { EncodeJobProgressState, EncodeQueueProgressState } from './encode-progress-state';
import { formatSessionFfmpegCommand } from './ffmpeg-command-display';
import { mediaLanguageName, mediaLanguageOptions } from './media-language';
import { applyStreamMetadataPatch, metadataTemporaryPath, streamMetadataChanged, streamMetadataPatch } from './metadata-edit';
import type { EditableStreamMetadata } from './metadata-edit';
import {
  attachedCoverArtArguments, isH264HighSource, musicVideoEncoderProfile, outputEncoderProfile,
  frameRateConversionArguments, frameRateOverrideState, shouldDefaultToHevcMain10,
} from './media-workflow';
import { mp4PlaybackArguments } from './mp4-playback';
import { consolidatePrimaryDispositions, setPrimaryDisposition } from './stream-dispositions';
import type {
  AdvancedVideoSettings, AppSettings, AudioStreamInfo, EncodeJob, EncodeProgress, FilterSettings, HardwareCapabilities, RuntimeState, SavedPreset,
  OutputFormat, ScaleMode, SourceFile, SourceScanProgress, StreamFlags, SubtitleStreamInfo,
} from './shared-types';

type IconName = 'app' | 'file' | 'folder' | 'plus' | 'queue' | 'play' | 'chevron' |
  'film' | 'video' | 'audio' | 'captions' | 'sliders' | 'copy' | 'check' | 'search' |
  'settings' | 'more' | 'sparkles' | 'gauge' | 'minus' | 'x';
type AudioCodec = 'libfdk_aac' | 'libopus' | 'copy';
type SubtitleCodec = 'subrip' | 'webvtt' | 'mov_text' | 'copy';
type AudioSetting = { enabled: boolean; codec: AudioCodec; bitrate: string; flags: StreamFlags; metadata: EditableStreamMetadata };
type SubtitleSetting = { enabled: boolean; codec: SubtitleCodec; flags: StreamFlags; metadata: EditableStreamMetadata };
type ProcessingSection = 'video' | 'audio' | 'subtitles';
type ProcessingSettings = Record<ProcessingSection, boolean>;
type FolderSeriesLayout = { sourceRoot: string; showFolder: string };
type JobSettings = {
  preset: string; format: OutputFormat; encoder: string; encoderSpeed: EncoderSpeed; encoderTune: string;
  encoderProfile: string;
  resolution: string; quality: string; videoBitrate: string; maxRate: string; bufferMultiplier: number; bufferSize: string;
  frameRate: PresetFrameRate;
  frameRateOverride: boolean;
  audio: Record<number, AudioSetting>; subtitles: Record<number, SubtitleSetting>;
  processing: ProcessingSettings;
  videoMetadata: EditableStreamMetadata;
  filters: FilterSettings;
  deliveryMode: boolean;
  advancedVideo: AdvancedVideoSettings;
};

const iconPaths: Record<IconName, string> = {
  app: '<path d="M4 7.5h16v9H4z"/><path d="m8 4 2 3.5M14 4l2 3.5M8 16.5 10 20M14 16.5 16 20"/><path d="M2.5 11.8h19"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m10 11 5 3-5 3z"/>',
  folder: '<path d="M3 6.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  queue: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".7"/><circle cx="3.5" cy="12" r=".7"/><circle cx="3.5" cy="18" r=".7"/>',
  play: '<path d="m8 5 11 7-11 7z"/>', chevron: '<path d="m9 18 6-6-6-6"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  video: '<path d="m22 8-6 4 6 4z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  audio: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  captions: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 10.5a2.5 2.5 0 1 0 0 3M17 10.5a2.5 2.5 0 1 0 0 3"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
  check: '<path d="m5 12 4 4L19 6"/>', search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21h-4v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3v-4h.09A1.7 1.7 0 0 0 4.64 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09a1.7 1.7 0 0 0 1.1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.38.37.72.6 1 .28.3.64.4 1 .4h.09v4H21a1.7 1.7 0 0 0-1.6.6z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  sparkles: '<path d="m12 3-1 3.5L7.5 8l3.5 1.5 1 3.5 1-3.5L16.5 8 13 6.5zM5 14l-.7 2.3L2 17l2.3.7L5 20l.7-2.3L8 17l-2.3-.7zM19 13l-.7 2.3-2.3.7 2.3.7L19 19l.7-2.3L22 16l-2.3-.7z"/>',
  gauge: '<path d="M4.9 19a9 9 0 1 1 14.2 0"/><path d="m12 13 4-4"/><path d="M12 4v2M4 12H2M22 12h-2"/>',
  minus: '<path d="M5 12h14"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
};
const icon = (name: IconName, size = 18) => `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;
const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root was not found');

const AAC_BITRATES = ['128k', '144k', '160k', '192k', '224k', '256k', '320k'];
const OPUS_BITRATES = ['32k', '48k', '64k', '80k', '96k', '112k', '128k'];
let sources: SourceFile[] = [];
let builtInPresetConfiguration: BuiltInPresetConfiguration | null = null;
let selectedIndex = 0;
let activeTab = 'Summary';
let outputDirectory = '';
let outputDirectoryIsCustom = false;
let encodingActive = false;
let toastTimer: number | undefined;
let runtimeState: RuntimeState | null = null;
let hardwareCapabilities: HardwareCapabilities = {
  checkedAt: '', adapters: [], ignoredAdapters: [], cudaAvailable: false, nvdecAvailable: false,
  cuvidDecoders: [], amfDecodeAvailable: false, qsvDecodeAvailable: false,
  qsvDecoders: [], vaapiAvailable: false, vaapiDevice: null, encoders: [],
};
let pickerBusy = false;
let customPresetDraftName = '';
let sourceMode: 'file' | 'folder' | null = null;
let folderSeriesLayout: FolderSeriesLayout | null = null;
let appSettings: AppSettings = { hardwareAcceleration: true, useStableFfmpeg: true, simultaneousEncoding: true, smartFileNaming: true, lastPreset: 'Streaming', lastSourceDirectory: '', customPresets: [], workingPreset: null, separateAudioDirectory: true };
const settingsByPath = new Map<string, JobSettings>();
let encodeQueueProgress: EncodeQueueProgressState | null = null;
let encodePageIndex = 0;
let encodePagePinned = false;
let encodeCancelAllRequested = false;
const encodeCancellingJobs = new Set<number>();

const escapeHtml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
const selected = (condition: boolean) => condition ? ' selected' : '';
const checked = (condition: boolean) => condition ? ' checked' : '';
const switchState = (condition: boolean) => ` aria-checked="${condition}"`;
const toggleSwitch = (control: HTMLElement) => {
  const enabled = control.getAttribute('aria-checked') !== 'true';
  control.setAttribute('aria-checked', String(enabled));
  return enabled;
};
const emptyAdvancedVideo = (): AdvancedVideoSettings => ({
  bFrames: false, multipass: 0, bRefMode: 'disabled', adaptiveBFrames: false,
  sceneCutDetection: false, rcLookahead: 0, nonReferenceP: false, spatialAq: 0, temporalAq: false,
});
const copyAdvancedVideo = (settings: AdvancedVideoSettings) => ({ ...settings });
const formatSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};
const formatDuration = (seconds: number | null) => {
  if (seconds === null) return 'Unknown';
  const whole = Math.round(seconds), hours = Math.floor(whole / 3600), minutes = Math.floor((whole % 3600) / 60), remaining = whole % 60;
  return hours ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}` : `${minutes}:${String(remaining).padStart(2, '0')}`;
};
const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
const parentPath = (filePath: string) => filePath.replace(/[\\/][^\\/]+$/, '');
const joinPath = (folder: string, name: string) => `${folder}${folder.includes('\\') ? '\\' : '/'}${name}`;
const displayArgument = (value: string) => /^[A-Za-z0-9_./:@=+\\-]+$/.test(value)
  ? value
  : `"${value.replace(/"/g, '\\"')}"`;
const isDeliveryPreset = (settings: JobSettings) => settings.deliveryMode;
const workflowOf = (source: SourceFile) => source.workflow ?? (source.media?.video ? 'video' : 'audio');
const isAudioWorkflow = (source: SourceFile) => workflowOf(source) === 'audio';
const isMusicVideoWorkflow = (source: SourceFile) => workflowOf(source) === 'music-video';
const isAudioPassthrough = (settings: JobSettings) => settings.format === 'source'
  || Object.values(settings.audio).some((track) => track.codec === 'copy');
const builtInPreset = (name: string) => builtInPresetConfiguration?.presets[name];
const requiredBuiltInPresetConfiguration = () => {
  if (!builtInPresetConfiguration) throw new Error('The built-in preset configuration is unavailable');
  return builtInPresetConfiguration;
};
const requiredBuiltInPreset = (name: BuiltInPresetName) => {
  const preset = builtInPreset(name);
  if (!preset) throw new Error(`The ${name} preset is unavailable`);
  return preset;
};
const outputProfileFor = (source: SourceFile, scale: ScaleMode, preset: string) =>
  videoOutputProfile(
    source.media?.video?.height ?? 0,
    scale,
    requiredBuiltInPresetConfiguration().outputProfiles,
    preset === 'Cellular',
  );
const softwareEncoderFor = (codec: PreferredVideoCodec) => codec === 'H.264'
  ? 'libx264' : codec === 'AV1' ? 'libsvtav1' : 'libx265';
const hardwareEncoderFor = (codec: PreferredVideoCodec) => appSettings.hardwareAcceleration
  ? hardwareCapabilities.encoders.find((encoder) => encoder.codec === codec)?.id
    ?? hardwareCapabilities.encoders[0]?.id
    ?? ''
  : softwareEncoderFor(codec);
const preferredCodecForEncoder = (encoder: string): PreferredVideoCodec =>
  /av1/i.test(encoder) ? 'AV1' : /264/i.test(encoder) ? 'H.264' : 'HEVC';
const normalizeQuality = (value: string) => String(Math.min(38, Math.max(12, Number(value) || 20)));
const encoderFamily = (encoder: string): EncoderFamily => encoder.endsWith('_nvenc')
  ? 'nvenc' : encoder.endsWith('_amf') ? 'amf'
    : encoder.endsWith('_qsv') ? 'qsv' : encoder.endsWith('_vaapi') ? 'vaapi'
      : encoder.endsWith('_videotoolbox') ? 'videotoolbox' : 'software';
const presetTune = (preset: BuiltInPresetDefinition, encoder: string) => preset.encoderTune[encoderFamily(encoder)];
const outputDefaultsFor = (
  preset: BuiltInPresetDefinition,
  tier: ReturnType<typeof videoOutputProfile>['tier'],
  encoder: string,
) => resolvePresetOutputDefaults(
  requiredBuiltInPresetConfiguration(), preset, tier, encoderFamily(encoder), preferredCodecForEncoder(encoder),
);
const deliveryQuality = (
  preset: BuiltInPresetDefinition,
  tier: ReturnType<typeof videoOutputProfile>['tier'],
  encoder: string,
) => outputDefaultsFor(preset, tier, encoder).quality;
const audioBitrateFor = (
  presetName: string,
  codec: AudioCodec,
  isStereo: boolean,
  fallback = codec === 'libopus' ? '96k' : '160k',
) => {
  const preset = builtInPreset(presetName);
  if (!preset || codec === 'copy') return fallback;
  const rates = preset.audioRates[(codec === 'libopus' ? 'opus' : 'aac') as PresetAudioCodec];
  return isStereo ? rates.stereo : rates.surround;
};
const orderByFlags = <T>(tracks: T[], flagsFor: (track: T) => StreamFlags) =>
  tracks.map((track, position) => ({ track, position, flags: flagsFor(track) }))
    .sort((left, right) => {
      const score = (flags: StreamFlags) => flags.default && flags.forced ? 0 : flags.default ? 1 : flags.forced ? 2 : 3;
      return score(left.flags) - score(right.flags) || left.position - right.position;
    })
    .map(({ track }) => track);
const audioQualityScore = (track: AudioStreamInfo) => {
  const codecBonus = track.isTrueHd ? 5 : track.isDts ? 4 : track.isAtmos ? 3 : track.isDolbyDigitalPlus ? 2 : track.codec === 'aac' ? 1 : 0;
  return track.channels * 1_000_000_000 + codecBonus * 100_000_000 + (track.bitRate ?? 0);
};
const preferredAudioIndexes = (tracks: AudioStreamInfo[]) => {
  const selected = new Set<number>();
  const bestByLanguage = new Map<string, AudioStreamInfo>();
  for (const track of tracks) {
    if (track.language === 'und') {
      selected.add(track.index);
      continue;
    }
    const current = bestByLanguage.get(track.language);
    if (!current || audioQualityScore(track) > audioQualityScore(current)) bestByLanguage.set(track.language, track);
  }
  bestByLanguage.forEach((track) => selected.add(track.index));
  return selected;
};
const preferredAudioFlags = (track: AudioStreamInfo, tracks: AudioStreamInfo[]): StreamFlags => {
  const related = track.language === 'und' ? [track] : tracks.filter((item) => item.language === track.language);
  return {
    default: related.some((item) => item.flags.default),
    forced: related.some((item) => item.flags.forced),
    hearingImpaired: false,
  };
};

const showToast = (message: string) => {
  let toast = document.querySelector<HTMLDivElement>('.toast');
  if (!toast) { toast = document.createElement('div'); toast.className = 'toast'; document.body.appendChild(toast); }
  toast.innerHTML = `${icon('check', 16)} ${escapeHtml(message)}`;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove('visible'), 2200);
};
const flagsLabel = (flags: { default: boolean; forced: boolean; hearingImpaired: boolean }) => {
  const labels = [];
  if (flags.default) labels.push('Default');
  if (flags.forced) labels.push('Forced');
  if (flags.hearingImpaired) labels.push('Hearing impaired');
  return labels.length ? labels.join(' · ') : 'No special flags';
};
const hdrLabel = (source: SourceFile) => {
  const video = source.media?.video;
  if (!video) return 'Unknown';
  if (video.hasHdr && video.hasDolbyVision) return `${video.hdrFormat ?? 'HDR'} + Dolby Vision`;
  if (video.hasDolbyVision) return 'Dolby Vision';
  return video.hdrFormat ?? 'SDR';
};
const persistAppSettings = () => window.mediaAPI.saveSettings(appSettings).catch(() => undefined);
const defaultFilters = (source: SourceFile): FilterSettings => ({
  autoCrop: true,
  toneMapHdrToSdr: true,
  pixelFormat10Bit: shouldDefaultToHevcMain10(source.media?.video),
  scale: 'disabled',
  scaleLocked: false,
  remuxAudio: true,
  remuxSubtitles: true,
  stripMetadata: true,
  doNotReplaceAudio: false,
  extractClosedCaptions: false,
  downmixToStereo: true,
  dynamicRangeCompression: true,
  resampleLosslessTo48k: true,
  normalizeAudio: true,
});
const metadataDispositionRecord = (record: Record<number, { metadata: EditableStreamMetadata }>) =>
  Object.fromEntries(Object.entries(record).map(([index, setting]) => [index, { flags: setting.metadata.flags }]));
const normalizeStreamDispositions = (settings: JobSettings) => {
  consolidatePrimaryDispositions(settings.audio);
  consolidatePrimaryDispositions(settings.subtitles);
  consolidatePrimaryDispositions(metadataDispositionRecord(settings.audio));
  consolidatePrimaryDispositions(metadataDispositionRecord(settings.subtitles));
};
const copyMetadata = (language: string, flags: StreamFlags): EditableStreamMetadata => ({
  language,
  flags: { ...flags },
});
const isMetadataOnly = (settings: JobSettings) =>
  settings.format !== 'source'
  && !settings.processing.video && !settings.processing.audio && !settings.processing.subtitles;
const sourceHasMetadataChanges = (source: SourceFile, settings = getSettings(source)) => {
  if ((source.media?.subtitles ?? []).some((track) => track.externalPath)) return true;
  const video = source.media?.video;
  if (video && streamMetadataChanged(video, settings.videoMetadata)) return true;
  if ((source.media?.audio ?? []).some((track) =>
    streamMetadataChanged(track, settings.audio[track.index].metadata))) return true;
  return (source.media?.subtitles ?? []).filter((track) => !track.externalPath).some((track) =>
    streamMetadataChanged(track, settings.subtitles[track.index].metadata));
};
const matchingMetadataQueueSources = (origin: SourceFile) => sources.filter((source) =>
  isAudioWorkflow(source) === isAudioWorkflow(origin));
const applyMetadataChangesToQueue = (originSource: SourceFile) => {
  const originSettings = getSettings(originSource);
  const originAudio = originSource.media?.audio ?? [];
  const originSubtitles = (originSource.media?.subtitles ?? []).filter((track) => !track.externalPath);
  let updatedSources = 0;
  for (const targetSource of matchingMetadataQueueSources(originSource)) {
    if (targetSource === originSource) continue;
    const targetSettings = getSettings(targetSource);
    let updated = false;
    if (!isAudioWorkflow(originSource) && originSource.media?.video && targetSource.media?.video) {
      updated = applyStreamMetadataPatch(
        targetSettings.videoMetadata,
        streamMetadataPatch(originSource.media.video, originSettings.videoMetadata),
      ) || updated;
    }
    const targetAudio = targetSource.media?.audio ?? [];
    originAudio.forEach((track, position) => {
      const targetTrack = targetAudio[position];
      const originMetadata = originSettings.audio[track.index]?.metadata;
      const targetMetadata = targetTrack && targetSettings.audio[targetTrack.index]?.metadata;
      if (originMetadata && targetMetadata) {
        updated = applyStreamMetadataPatch(targetMetadata, streamMetadataPatch(track, originMetadata)) || updated;
      }
    });
    const targetSubtitles = (targetSource.media?.subtitles ?? []).filter((track) => !track.externalPath);
    originSubtitles.forEach((track, position) => {
      const targetTrack = targetSubtitles[position];
      const originMetadata = originSettings.subtitles[track.index]?.metadata;
      const targetMetadata = targetTrack && targetSettings.subtitles[targetTrack.index]?.metadata;
      if (originMetadata && targetMetadata) {
        updated = applyStreamMetadataPatch(targetMetadata, streamMetadataPatch(track, originMetadata)) || updated;
      }
    });
    if (updated) updatedSources += 1;
  }
  return updatedSources;
};
const initialAudioSettings = (source: SourceFile): JobSettings => {
  const track = source.media?.audio[0];
  const preset = AUDIO_PRESETS.Streaming;
  return {
    preset: 'Streaming', format: 'opus', encoder: '', encoderSpeed: 4, encoderTune: '', encoderProfile: '', resolution: '', quality: '',
    videoBitrate: '0', maxRate: '0', bufferMultiplier: 0, bufferSize: '0', deliveryMode: false,
    frameRate: 'passthrough', frameRateOverride: false,
    advancedVideo: emptyAdvancedVideo(),
    processing: { video: false, audio: true, subtitles: false },
    videoMetadata: copyMetadata('und', { default: false, forced: false, hearingImpaired: false }),
    audio: track ? { [track.index]: {
      enabled: true, codec: preset.codec, bitrate: audioBitrate('Streaming', track, true),
      flags: { default: true, forced: false, hearingImpaired: false },
      metadata: copyMetadata(track.language, track.flags),
    } } : {},
    subtitles: {},
    filters: { ...defaultFilters(source), stripMetadata: false },
  };
};

const applyAudioPreset = (source: SourceFile, presetName: string) => {
  const saved = presetName === 'Custom'
    ? appSettings.workingPreset
    : appSettings.customPresets.find((preset) => preset.name === presetName && preset.workflow === 'audio');
  if (saved) {
    const settings = settingsByPath.get(source.path) ?? initialAudioSettings(source);
    settingsByPath.set(source.path, settings);
    settings.preset = presetName;
    settings.format = saved.format;
    settings.processing = { video: false, audio: saved.audioCodec !== 'copy', subtitles: false };
    settings.filters = { ...saved.filters };
    for (const track of source.media?.audio ?? []) {
      settings.audio[track.index] = {
        enabled: true, codec: saved.audioCodec, bitrate: saved.audioBitrate,
        flags: { default: true, forced: false, hearingImpaired: false },
        metadata: settings.audio[track.index]?.metadata ?? copyMetadata(track.language, track.flags),
      };
    }
    return;
  }
  const name = AUDIO_PRESET_NAMES.includes(presetName as AudioPresetName)
    ? presetName as AudioPresetName
    : 'Streaming';
  const settings = settingsByPath.get(source.path) ?? initialAudioSettings(source);
  const preset = AUDIO_PRESETS[name];
  settingsByPath.set(source.path, settings);
  settings.preset = name;
  settings.format = name === 'Passthrough' ? 'source' : preset.extension as 'opus' | 'm4a';
  settings.processing = { video: false, audio: name !== 'Passthrough', subtitles: false };
  settings.filters = {
    ...defaultFilters(source), stripMetadata: false, downmixToStereo: true,
    dynamicRangeCompression: preset.dynamicRangeCompression,
    resampleLosslessTo48k: true, normalizeAudio: true,
  };
  for (const track of source.media?.audio ?? []) {
    settings.audio[track.index] = {
      enabled: true, codec: preset.codec,
      bitrate: name === 'Passthrough' ? '' : audioBitrate(name, track, settings.filters.downmixToStereo),
      flags: { default: true, forced: false, hearingImpaired: false },
      metadata: settings.audio[track.index]?.metadata ?? copyMetadata(track.language, track.flags),
    };
  }
  appSettings.separateAudioDirectory = name !== 'Passthrough';
};

const applyMusicVideoPreset = (source: SourceFile) => {
  const preset = requiredBuiltInPreset('Music Video');
  const outputProfile = videoOutputProfile(
    source.media?.video?.height ?? 0, 'auto', requiredBuiltInPresetConfiguration().outputProfiles,
  );
  const settings = settingsByPath.get(source.path) ?? initialSettings(source);
  settingsByPath.set(source.path, settings);
  const encoder = hardwareEncoderFor(preset.preferredVideoCodec);
  const outputDefaults = outputDefaultsFor(preset, outputProfile.tier, encoder);
  Object.assign(settings, {
    preset: 'Music Video', format: preset.format, encoder,
    encoderSpeed: normalizeEncoderSpeed(outputDefaults.encoderSpeed),
    encoderTune: normalizeEncoderTune(encoder, presetTune(preset, encoder)),
    encoderProfile: outputDefaults.encoderProfile,
    resolution: outputDefaults.resolution.join(':'), quality: outputDefaults.quality,
    videoBitrate: String(outputDefaults.videoBitrate), maxRate: String(outputDefaults.maxRate), bufferMultiplier: preset.bufferMultiplier,
    bufferSize: String(bufferSizeFor(outputDefaults.maxRate, preset.bufferMultiplier)),
    frameRate: preset.frameRate, frameRateOverride: false,
    deliveryMode: preset.deliveryMode,
    advancedVideo: resolvePresetAdvancedVideo(preset, preferredCodecForEncoder(encoder), outputProfile.tier),
    processing: { video: true, audio: true, subtitles: true },
  });
  settings.filters = {
    ...defaultFilters(source), scale: preset.scale, scaleLocked: preset.scaleLocked, stripMetadata: false,
    extractClosedCaptions: true, pixelFormat10Bit: isH264HighSource(source.media?.video),
    dynamicRangeCompression: preset.dynamicRangeCompression,
  };
  for (const track of source.media?.audio ?? []) {
    settings.audio[track.index] = {
      enabled: true, codec: 'libfdk_aac', bitrate: audioBitrateFor(preset.name, 'libfdk_aac', track.isStereo),
      flags: { ...track.flags },
      metadata: settings.audio[track.index]?.metadata ?? copyMetadata(track.language, track.flags),
    };
  }
  normalizeStreamDispositions(settings);
};

const initialSettings = (source: SourceFile): JobSettings => {
  if (isAudioWorkflow(source)) return initialAudioSettings(source);
  const preset = requiredBuiltInPreset('Streaming');
  const outputProfile = outputProfileFor(source, preset.scale, preset.name);
  const encoder = hardwareEncoderFor(preferredVideoCodecForPreset(preset, outputProfile.tier));
  const outputDefaults = outputDefaultsFor(preset, outputProfile.tier, encoder);
  const profilePreset = outputDefaults.deliveryPreset;
  const selectedAudio = preferredAudioIndexes(source.media?.audio ?? []);
  const settings: JobSettings = {
    preset: 'Streaming', format: preset.format, encoder, encoderSpeed: normalizeEncoderSpeed(outputDefaults.encoderSpeed), encoderTune: normalizeEncoderTune(encoder, presetTune(preset, encoder)), encoderProfile: outputDefaults.encoderProfile,
    resolution: outputDefaults.resolution.join(':'), quality: outputDefaults.quality,
    videoBitrate: String(outputDefaults.videoBitrate), maxRate: String(outputDefaults.maxRate), bufferMultiplier: preset.bufferMultiplier,
    bufferSize: String(bufferSizeFor(outputDefaults.maxRate, preset.bufferMultiplier)),
    frameRate: preset.frameRate,
    frameRateOverride: frameRateOverrideState(source.media?.video?.frameRate, preset.frameRate).enabled,
    advancedVideo: resolvePresetAdvancedVideo(profilePreset, preferredCodecForEncoder(encoder), outputProfile.tier),
    processing: { video: true, audio: true, subtitles: true },
    videoMetadata: copyMetadata(source.media?.video?.language ?? 'und', source.media?.video?.flags ?? { default: false, forced: false, hearingImpaired: false }),
    audio: Object.fromEntries((source.media?.audio ?? []).map((track) => [track.index, {
      enabled: selectedAudio.has(track.index), codec: preset.audioCodec === 'opus' ? 'libopus' : 'libfdk_aac',
      bitrate: audioBitrateFor(profilePreset.name, preset.audioCodec === 'opus' ? 'libopus' : 'libfdk_aac', track.isStereo),
      flags: selectedAudio.has(track.index)
        ? preferredAudioFlags(track, source.media?.audio ?? [])
        : { default: false, forced: false, hearingImpaired: false },
      metadata: copyMetadata(track.language, track.flags),
    }])),
    subtitles: Object.fromEntries((source.media?.subtitles ?? []).map((track) => [track.index, {
      enabled: track.kind === 'text', codec: track.kind === 'text' ? 'mov_text' : 'copy',
      flags: { ...track.flags }, metadata: copyMetadata(track.language, track.flags),
    }])),
    filters: {
      ...defaultFilters(source), scale: preset.scale, scaleLocked: preset.scaleLocked,
      dynamicRangeCompression: preset.dynamicRangeCompression,
    }, deliveryMode: preset.deliveryMode,
  };
  normalizeStreamDispositions(settings);
  return settings;
};
const getSettings = (source: SourceFile) => {
  let settings = settingsByPath.get(source.path);
  if (!settings) {
    settings = initialSettings(source);
    settingsByPath.set(source.path, settings);
    applyPreset(source, isMusicVideoWorkflow(source) ? 'Music Video' : 'Streaming', false);
  }
  return settings;
};
const applyPreset = (source: SourceFile, preset: string, persist = true) => {
  if (isAudioWorkflow(source)) {
    applyAudioPreset(source, preset);
    if (persist) void persistAppSettings();
    return;
  }
  if (isMusicVideoWorkflow(source)) {
    applyMusicVideoPreset(source);
    if (persist) void persistAppSettings();
    return;
  }
  const settings = getSettings(source);
  const saved = preset === 'Custom'
    ? appSettings.workingPreset
    : appSettings.customPresets.find((item) => item.name === preset);
  const defaults = builtInPreset(preset);
  if (!defaults && !saved) {
    settings.preset = 'Custom';
    return;
  }
  const selectedPreset = defaults ?? saved as SavedPreset;
  const outputProfile = defaults ? outputProfileFor(source, defaults.scale, defaults.name) : null;
  const encoder = defaults
    ? hardwareEncoderFor(preferredVideoCodecForPreset(defaults, outputProfile!.tier))
    : hardwareCapabilities.encoders.some((item) => item.id === saved!.encoder)
      ? saved!.encoder
      : hardwareEncoderFor(preferredCodecForEncoder(saved!.encoder));
  const outputDefaults = defaults && outputProfile ? outputDefaultsFor(defaults, outputProfile.tier, encoder) : null;
  const profileDefaults = outputDefaults?.deliveryPreset ?? null;
  Object.assign(settings, {
    preset,
    format: selectedPreset.format,
    encoder,
    encoderSpeed: normalizeEncoderSpeed(defaults ? outputDefaults!.encoderSpeed : saved!.encoderSpeed),
    encoderTune: normalizeEncoderTune(encoder, defaults ? presetTune(defaults, encoder) : saved!.encoderTune),
    encoderProfile: defaults ? outputDefaults!.encoderProfile : saved!.encoderProfile,
    quality: defaults ? outputDefaults!.quality : normalizeQuality(saved!.quality),
    videoBitrate: defaults ? String(defaults.bitrateControl ? outputDefaults!.videoBitrate : 0) : saved!.videoBitrate,
    maxRate: defaults ? String(defaults.bitrateControl ? outputDefaults!.maxRate : 0) : saved!.maxRate,
    bufferMultiplier: defaults ? defaults.bufferMultiplier : saved!.bufferMultiplier,
    bufferSize: defaults ? String(bufferSizeFor(defaults.bitrateControl ? outputDefaults!.maxRate : 0, defaults.bufferMultiplier)) : saved!.bufferSize,
    frameRate: defaults ? defaults.frameRate : saved!.frameRate,
    frameRateOverride: defaults
      ? frameRateOverrideState(source.media?.video?.frameRate, defaults.frameRate).enabled
      : frameRateOverrideState(source.media?.video?.frameRate, saved!.frameRate).enabled,
    deliveryMode: selectedPreset.deliveryMode,
    advancedVideo: defaults
      ? resolvePresetAdvancedVideo(profileDefaults!, preferredCodecForEncoder(encoder), outputProfile!.tier)
      : copyAdvancedVideo(saved!.advancedVideo),
  });
  if (defaults) settings.resolution = defaults.scale === 'disabled' ? defaults.resolution : outputDefaults!.resolution.join(':');
  settings.filters = defaults
    ? {
      ...defaultFilters(source), scale: defaults.scale, scaleLocked: defaults.scaleLocked,
      dynamicRangeCompression: defaults.dynamicRangeCompression,
    }
    : { ...saved!.filters };
  const codec = defaults ? defaults.audioCodec === 'opus' ? 'libopus' : 'libfdk_aac' : saved!.audioCodec;
  const selectedAudio = preferredAudioIndexes(source.media?.audio ?? []);
  for (const track of source.media?.audio ?? []) {
    const metadata = settings.audio[track.index]?.metadata ?? copyMetadata(track.language, track.flags);
    settings.audio[track.index] = {
      enabled: selectedAudio.has(track.index), codec,
      bitrate: defaults ? audioBitrateFor(profileDefaults!.name, codec, track.isStereo) : saved!.audioBitrate,
      flags: selectedAudio.has(track.index)
        ? preferredAudioFlags(track, source.media?.audio ?? [])
        : { default: false, forced: false, hearingImpaired: false },
      metadata,
    };
  }
  for (const track of source.media?.subtitles ?? []) {
    const subtitle = settings.subtitles[track.index];
    if (!subtitle) continue;
    if (settings.format === 'mp4') { subtitle.enabled = track.kind === 'text'; subtitle.codec = track.kind === 'text' ? 'mov_text' : 'copy'; }
    else if (settings.format === 'webm') { subtitle.enabled = track.kind === 'text'; subtitle.codec = track.kind === 'text' ? 'webvtt' : 'copy'; }
    else if (track.kind === 'text' && (subtitle.codec === 'mov_text' || subtitle.codec === 'webvtt')) subtitle.codec = 'subrip';
  }
  normalizeStreamDispositions(settings);
  if (persist) {
    appSettings.lastPreset = preset;
    void persistAppSettings();
  }
};
const applyBuiltInScaleProfile = (
  source: SourceFile,
  settings: JobSettings,
  scale: ScaleMode,
) => {
  const defaults = builtInPreset(settings.preset);
  if (!defaults) return false;
  const outputProfile = outputProfileFor(source, scale, defaults.name);
  const encoder = hardwareEncoderFor(preferredVideoCodecForPreset(defaults, outputProfile.tier));
  const outputDefaults = outputDefaultsFor(defaults, outputProfile.tier, encoder);
  const profileDefaults = outputDefaults.deliveryPreset;
  settings.filters.scale = scale;
  settings.filters.scaleLocked = defaults.scaleLocked;
  settings.encoder = encoder;
  settings.encoderTune = normalizeEncoderTune(encoder, presetTune(defaults, encoder));
  settings.resolution = scale === 'disabled' ? defaults.resolution : outputDefaults.resolution.join(':');
  settings.encoderSpeed = normalizeEncoderSpeed(outputDefaults.encoderSpeed);
  settings.encoderProfile = outputDefaults.encoderProfile;
  settings.quality = outputDefaults.quality;
  settings.videoBitrate = String(defaults.bitrateControl ? outputDefaults.videoBitrate : 0);
  settings.maxRate = String(defaults.bitrateControl ? outputDefaults.maxRate : 0);
  settings.bufferMultiplier = defaults.bufferMultiplier;
  settings.bufferSize = String(bufferSizeFor(defaults.bitrateControl ? outputDefaults.maxRate : 0, defaults.bufferMultiplier));
  settings.deliveryMode = profileDefaults.deliveryMode;
  settings.advancedVideo = resolvePresetAdvancedVideo(profileDefaults, preferredCodecForEncoder(encoder), outputProfile.tier);
  for (const track of source.media?.audio ?? []) {
    const audio = settings.audio[track.index];
    if (audio && audio.codec !== 'copy') {
      audio.bitrate = audioBitrateFor(profileDefaults.name, audio.codec, track.isStereo);
    }
  }
  return true;
};
const matchingTrackIndex = <T extends { index: number; language: string }>(
  originTracks: T[],
  targetTracks: T[],
  targetIndex: number,
) => {
  const target = targetTracks.find((track) => track.index === targetIndex);
  if (!target) return null;
  const targetLanguageTracks = targetTracks.filter((track) => track.language === target.language);
  const ordinal = targetLanguageTracks.findIndex((track) => track.index === targetIndex);
  return originTracks.filter((track) => track.language === target.language)[ordinal]?.index ?? null;
};
const syncBatchTrackSettings = (
  originSource: SourceFile,
  origin: JobSettings,
  targetSource: SourceFile,
  target: JobSettings,
) => {
  const originAudio = originSource.media?.audio ?? [];
  const targetAudio = targetSource.media?.audio ?? [];
  for (const track of targetAudio) {
    const originIndex = matchingTrackIndex(originAudio, targetAudio, track.index);
    const sourceSetting = originIndex === null ? null : origin.audio[originIndex];
    if (!sourceSetting) continue;
    const metadata = target.audio[track.index].metadata;
    target.audio[track.index] = { ...sourceSetting, flags: { ...sourceSetting.flags }, metadata };
  }
  const originSubtitles = originSource.media?.subtitles ?? [];
  const targetSubtitles = targetSource.media?.subtitles ?? [];
  for (const track of targetSubtitles) {
    const originIndex = matchingTrackIndex(originSubtitles, targetSubtitles, track.index);
    const originTrack = originIndex === null ? null : originSubtitles.find((item) => item.index === originIndex);
    const sourceSetting = originIndex === null ? null : origin.subtitles[originIndex];
    if (!sourceSetting || originTrack?.kind !== track.kind) continue;
    const metadata = target.subtitles[track.index].metadata;
    target.subtitles[track.index] = { ...sourceSetting, flags: { ...sourceSetting.flags }, metadata };
    if (target.format === 'mp4') {
      target.subtitles[track.index].enabled = track.kind === 'text' && sourceSetting.enabled;
      target.subtitles[track.index].codec = track.kind === 'text' ? 'mov_text' : 'copy';
    } else if (target.format === 'webm') {
      target.subtitles[track.index].enabled = track.kind === 'text' && sourceSetting.enabled;
      target.subtitles[track.index].codec = track.kind === 'text' ? 'webvtt' : 'copy';
    }
  }
  normalizeStreamDispositions(target);
};
const markCustom = (settings: JobSettings) => {
  const originSource = sources.find((source) => settingsByPath.get(source.path) === settings);
  if (originSource && isMusicVideoWorkflow(originSource)) {
    settings.preset = 'Music Video';
    void persistAppSettings();
    return;
  }
  settings.preset = 'Custom';
  settings.filters.scaleLocked = false;
  appSettings.lastPreset = 'Custom';
  appSettings.workingPreset = snapshotPreset(settings, 'Custom');
  const presetSelect = document.querySelector<HTMLSelectElement>('#preset');
  if (presetSelect) {
    if (![...presetSelect.options].some((option) => option.value === 'Custom')) {
      presetSelect.add(new Option('Custom', 'Custom'));
    }
    presetSelect.value = 'Custom';
  }
  const editor = document.querySelector<HTMLElement>('#custom-preset-editor');
  if (editor) editor.hidden = false;
  const description = document.querySelector<HTMLElement>('.preset-description');
  if (description) description.textContent = 'Modified settings ready to save as a preset.';
  for (const source of sources) {
    const target = getSettings(source);
    if (target !== settings) {
      applyPreset(source, 'Custom', false);
      if (originSource) syncBatchTrackSettings(originSource, settings, source, target);
    }
  }
  void persistAppSettings();
};
const snapshotPreset = (settings: JobSettings, name: string): SavedPreset => {
  const firstAudio = Object.values(settings.audio).find((audio) => audio.enabled)
    ?? Object.values(settings.audio)[0]
    ?? { codec: 'libfdk_aac' as AudioCodec, bitrate: '192k' };
  return {
    name,
    description: name,
    workflow: settings.format === 'opus' || settings.format === 'm4a' || settings.format === 'source' ? 'audio' : 'video',
    format: settings.format,
    encoder: settings.encoder,
    encoderSpeed: settings.encoderSpeed,
    encoderTune: settings.encoderTune,
    encoderProfile: settings.encoderProfile,
    frameRate: settings.frameRate,
    quality: settings.quality,
    videoBitrate: settings.videoBitrate,
    maxRate: settings.maxRate,
    bufferMultiplier: settings.bufferMultiplier,
    bufferSize: settings.bufferSize,
    deliveryMode: settings.deliveryMode,
    advancedVideo: copyAdvancedVideo(settings.advancedVideo),
    audioCodec: firstAudio.codec,
    audioBitrate: firstAudio.bitrate,
    filters: { ...settings.filters, scaleLocked: false },
  };
};
const detectFolderSeriesLayout = (folderSources: SourceFile[]): FolderSeriesLayout | null => {
  if (!folderSources.length) return null;
  const showFolder = commonSeriesFolderName(folderSources.map((source) => source.name));
  if (!showFolder) return null;
  return { sourceRoot: folderSources[0].sourceRoot ?? parentPath(folderSources[0].path), showFolder };
};
const makeDefaultOutputDirectory = (source: SourceFile) => {
  if (isAudioWorkflow(source)) {
    if (!appSettings.separateAudioDirectory || isAudioPassthrough(getSettings(source))) return parentPath(source.path);
    const root = source.sourceRoot ?? parentPath(source.path);
    const relative = source.relativePath ?? source.name;
    const relativeDirectory = parentPath(relative) === relative ? '' : parentPath(relative);
    const convertedRoot = joinPath(root, 'converted');
    return relativeDirectory ? joinPath(convertedRoot, relativeDirectory) : convertedRoot;
  }
  if (sourceMode === 'folder' && folderSeriesLayout) {
    const identity = parseEpisodeIdentity(source.name);
    if (identity) {
      return joinPath(
        joinPath(joinPath(folderSeriesLayout.sourceRoot, 'converted'), folderSeriesLayout.showFolder),
        `Season ${String(identity.season).padStart(2, '0')}`,
      );
    }
  }
  if (sourceMode === 'folder' && appSettings.smartFileNaming && !parseEpisodeIdentity(source.name)) {
    const root = source.sourceRoot ?? parentPath(source.path);
    return joinPath(joinPath(root, 'converted'), smartMovieFolderName(source.name));
  }
  return joinPath(parentPath(source.path), 'converted');
};
const makeOutputFileName = (source: SourceFile) => {
  if (isMetadataOnly(getSettings(source))) return source.name;
  const format = getSettings(source).format;
  if (isAudioWorkflow(source)) {
    const extension = format === 'source' ? source.extension.toLowerCase() : format;
    return `${preservedOutputBaseName(source.name)}.${extension}`;
  }
  const name = isMusicVideoWorkflow(source)
    ? preservedOutputBaseName(source.name)
    : appSettings.smartFileNaming
    ? smartSeriesBaseName(source.name)
    : sanitizePathSegment(`${baseName(source.name)}_converted`);
  return `${name}.${format}`;
};
const outputDirectoryFor = (source: SourceFile) => {
  if (isAudioWorkflow(source) && outputDirectoryIsCustom && appSettings.separateAudioDirectory) {
    const relative = source.relativePath ?? source.name;
    const relativeDirectory = parentPath(relative) === relative ? '' : parentPath(relative);
    return relativeDirectory ? joinPath(outputDirectory, relativeDirectory) : outputDirectory;
  }
  return outputDirectoryIsCustom
    ? isMetadataOnly(getSettings(source)) ? parentPath(source.path) : outputDirectory
    : isMetadataOnly(getSettings(source)) ? parentPath(source.path) : makeDefaultOutputDirectory(source);
};
const makeOutputPath = (source: SourceFile) => joinPath(outputDirectoryFor(source), makeOutputFileName(source));
const dispositionValue = (flags: StreamFlags) => {
  const values = [];
  if (flags.default) values.push('default');
  if (flags.forced) values.push('forced');
  if (flags.hearingImpaired) values.push('hearing_impaired');
  return values.length ? values.join('+') : '0';
};
const qualityLabel = (encoder: string) => {
  if (encoder.endsWith('_nvenc')) return 'CQ';
  if (encoder.endsWith('_amf')) return 'QVBR';
  if (encoder.endsWith('_qsv')) return 'ICQ';
  if (encoder.endsWith('_vaapi')) return 'QP';
  if (encoder.endsWith('_videotoolbox')) return 'Q';
  return 'RF';
};
const addEncodedAudioFilterArguments = (
  args: string[],
  outputIndex: number,
  track: AudioStreamInfo,
  downmixToStereo: boolean,
  dynamicRangeCompression: boolean,
  resampleTo48k = false,
) => {
  args.push(
    `-filter:a:${outputIndex}`,
    encodedAudioFilter(track, downmixToStereo, dynamicRangeCompression && track.channels > 2, resampleTo48k),
  );
  if (downmixToStereo && track.channels <= 2) args.push(`-ac:a:${outputIndex}`, '2');
};
const encoderCanOutput10Bit = (encoder: string) => encoder === 'libx265'
  || Boolean(hardwareCapabilities.encoders.find((item) => item.id === encoder)?.tenBit);

const qsvDecoderName = (source: SourceFile) => {
  const codecNames: Record<string, string> = {
    H264: 'h264', AVC: 'h264', HEVC: 'hevc', H265: 'hevc', AV1: 'av1',
    VP9: 'vp9', VP8: 'vp8', MPEG2VIDEO: 'mpeg2', MPEG4: 'mpeg4', VC1: 'vc1', MJPEG: 'mjpeg',
  };
  const base = codecNames[source.media?.video?.codec.toUpperCase() ?? ''];
  return base ? `${base}_qsv` : null;
};
const detectedCropForSource = (source: SourceFile) => {
  const video = source.media?.video;
  return video ? detectedCrop(source.media?.suggestedCrop, video.width, video.height) : null;
};
const hardwareInputArguments = (source: SourceFile, settings: JobSettings, forceSoftwareDecode = false) => {
  if (settings.encoder.endsWith('_vaapi') && hardwareCapabilities.vaapiAvailable && hardwareCapabilities.vaapiDevice) {
    return {
      args: ['-vaapi_device', hardwareCapabilities.vaapiDevice],
      cropHandledByDecoder: false, backend: 'vaapi' as const,
    };
  }
  const requiresUniversalCrop = settings.filters.autoCrop && Boolean(detectedCropForSource(source));
  const canUseCuda = appSettings.hardwareAcceleration
    && settings.encoder.endsWith('_nvenc')
    && hardwareCapabilities.cudaAvailable
    && hardwareCapabilities.nvdecAvailable;
  if (forceSoftwareDecode || (requiresUniversalCrop && !canUseCuda)) {
    return { args: [] as string[], cropHandledByDecoder: false, backend: 'software' as const };
  }
  if (!appSettings.hardwareAcceleration) return { args: [] as string[], cropHandledByDecoder: false, backend: 'software' as const };
  if (canUseCuda) {
    const video = source.media?.video;
    const crop = video && settings.filters.autoCrop ? detectedCropForSource(source) : null;
    const decoder = crop ? cuvidDecoderName(video?.codec) : null;
    const decoderCrop = video && crop
      ? cuvidCropMargins(crop, video.width, video.height)
      : null;
    const decoderCropArgs = cuvidDecoderCropArguments(decoder, decoderCrop, hardwareCapabilities.cuvidDecoders);
    return {
      args: cudaHardwareDecodeArguments(decoderCropArgs),
      cropHandledByDecoder: decoderCropArgs.length > 0, backend: 'cuda' as const,
    };
  }
  if (settings.encoder.endsWith('_amf') && hardwareCapabilities.amfDecodeAvailable) {
    return {
      args: [
        '-init_hw_device', 'amf=am:0', '-filter_hw_device', 'am', '-hwaccel', 'amf',
        ...protectedHardwareDecodeArguments(),
      ],
      cropHandledByDecoder: false, backend: 'amf' as const,
    };
  }
  if (settings.encoder.endsWith('_qsv') && hardwareCapabilities.qsvDecodeAvailable) {
    const decoder = qsvDecoderName(source);
    const args = [
      '-init_hw_device', 'qsv=qs:hw', '-filter_hw_device', 'qs', '-hwaccel', 'qsv',
      ...protectedHardwareDecodeArguments(),
    ];
    if (decoder && hardwareCapabilities.qsvDecoders.includes(decoder)) args.push('-c:v:0', decoder);
    return { args, cropHandledByDecoder: false, backend: 'qsv' as const };
  }
  if (settings.encoder.endsWith('_videotoolbox')) {
    return {
      args: ['-hwaccel', 'videotoolbox', ...protectedHardwareDecodeArguments()],
      cropHandledByDecoder: false, backend: 'software' as const,
    };
  }
  return { args: ['-hwaccel', 'auto'], cropHandledByDecoder: false, backend: 'software' as const };
};
const decoderStatus = (source: SourceFile, settings: JobSettings) => {
  if (isAudioWorkflow(source) || !settings.processing.video || !appSettings.hardwareAcceleration) {
    return { label: 'SOFTWARE', hardware: false };
  }
  if (settings.encoder.endsWith('_nvenc') && hardwareCapabilities.cudaAvailable && hardwareCapabilities.nvdecAvailable) {
    return { label: 'NVIDIA NVDEC', hardware: true };
  }
  if (settings.filters.autoCrop && detectedCropForSource(source)) {
    return { label: 'SOFTWARE', hardware: false };
  }
  if (settings.encoder.endsWith('_amf') && hardwareCapabilities.amfDecodeAvailable) {
    return { label: 'AMD AMF', hardware: true };
  }
  if (settings.encoder.endsWith('_qsv') && hardwareCapabilities.qsvDecodeAvailable) {
    return { label: 'INTEL QSV', hardware: true };
  }
  if (settings.encoder.endsWith('_videotoolbox')) return { label: 'APPLE VIDEOTOOLBOX', hardware: true };
  return { label: 'SOFTWARE', hardware: false };
};
const hardwareScaleDimensions = (source: SourceFile, settings: JobSettings): [string, string] | null => {
  const video = source.media?.video;
  if (!video) return null;
  const dimensions = isMusicVideoWorkflow(source)
    ? video.height >= 2160
      ? outputDefaultsFor(
        requiredBuiltInPreset('Music Video'),
        outputProfileFor(source, 'auto', 'Music Video').tier,
        settings.encoder,
      ).resolution
      : null
    : scaleDimensionsFor(
      video.height,
      settings.filters.scale,
      requiredBuiltInPresetConfiguration().outputProfiles,
      settings.preset === 'Cellular',
    );
  if (!dimensions) return null;
  const crop = settings.filters.autoCrop ? detectedCropForSource(source) : null;
  return aspectPreservingDimensions(dimensions, video.width, video.height, crop);
};
const softwareScaleFilter = (source: SourceFile, settings: JobSettings) => {
  const dimensions = hardwareScaleDimensions(source, settings);
  return dimensions ? `scale=${dimensions[0]}:${dimensions[1]}` : null;
};
const softwareToneMapFilters = (dolbyVision: boolean, format: 'nv12' | 'p010le') => [
  ...(dolbyVision ? ['setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc'] : []),
  'zscale=t=linear:npl=100', 'format=gbrpf32le', 'zscale=p=bt709',
  'tonemap=tonemap=hable:desat=0', 'zscale=t=bt709:m=bt709:r=tv', `format=${format}`,
];
const hardwareAccelerationSummary = () => {
  const capabilities = [];
  if (hardwareCapabilities.cudaAvailable) capabilities.push('CUDA');
  if (hardwareCapabilities.nvdecAvailable) capabilities.push('NVDEC');
  if (hardwareCapabilities.amfDecodeAvailable) capabilities.push('AMF decode');
  if (hardwareCapabilities.qsvDecodeAvailable) capabilities.push('QSV decode');
  if (hardwareCapabilities.vaapiAvailable) capabilities.push('VA-API');
  return capabilities.length ? capabilities.join(' · ') : 'hardware encode only';
};

const addStreamMetadataArguments = (
  args: string[],
  kind: 'v' | 'a' | 's',
  outputIndex: number,
  metadata: EditableStreamMetadata,
) => {
  args.push(`-metadata:s:${kind}:${outputIndex}`, `language=${metadata.language}`);
  args.push(`-disposition:${kind}:${outputIndex}`, dispositionValue(metadata.flags));
};

const metadataOnlyArguments = (source: SourceFile, settings: JobSettings, outputPath: string) => {
  const subtitleTracks = source.media?.subtitles ?? [];
  const externalTracks = subtitleTracks.filter((track) => track.externalPath);
  const embeddedTracks = subtitleTracks.filter((track) => !track.externalPath);
  const args = ['-i', source.path, ...externalSubtitleInputArguments(externalTracks), '-map', '0'];
  externalTracks.forEach((track) => args.push('-map', subtitleInputSpecifier(track, subtitleTracks)));
  args.push('-c', 'copy', '-map_metadata', '0', '-map_chapters', '0');
  if (source.media?.video && streamMetadataChanged(source.media.video, settings.videoMetadata)) {
    addStreamMetadataArguments(args, 'v', 0, settings.videoMetadata);
  }
  (source.media?.audio ?? []).forEach((track, index) => {
    const metadata = settings.audio[track.index].metadata;
    if (streamMetadataChanged(track, metadata)) addStreamMetadataArguments(args, 'a', index, metadata);
  });
  embeddedTracks.forEach((track, index) => {
    const metadata = settings.subtitles[track.index].metadata;
    if (streamMetadataChanged(track, metadata)) addStreamMetadataArguments(args, 's', index, metadata);
  });
  const externalCodec = /\.(?:mp4|m4v|mov)$/i.test(source.path)
    ? 'mov_text'
    : /\.webm$/i.test(source.path) ? 'webvtt' : 'subrip';
  externalTracks.forEach((track, index) => {
    const outputIndex = embeddedTracks.length + index;
    args.push(`-c:s:${outputIndex}`, externalCodec);
    addStreamMetadataArguments(args, 's', outputIndex, settings.subtitles[track.index].metadata);
  });
  if (/\.(?:mp4|m4v|mov)$/i.test(source.path)) args.push('-movflags', '+faststart');
  args.push(outputPath);
  return args;
};

const audioCommandArguments = (source: SourceFile, settings: JobSettings, outputPath: string) => {
  if (isAudioPassthrough(settings)) return [];
  const track = source.media?.audio[0];
  const audio = track ? settings.audio[track.index] : null;
  if (!track || !audio) return [];
  const args = ['-i', source.path, '-map', `0:${track.index}`, '-vn', '-sn', '-dn', '-c:a:0', audio.codec];
  if (audio.bitrate) args.push('-b:a:0', audio.bitrate);
  addEncodedAudioFilterArguments(
    args, 0, track, settings.filters.downmixToStereo && !track.isStereo,
    settings.filters.dynamicRangeCompression,
    shouldResampleLossless(track, settings.filters.resampleLosslessTo48k),
  );
  addStreamMetadataArguments(args, 'a', 0, audio.metadata);
  if (settings.filters.stripMetadata) args.push('-map_metadata', '-1');
  else args.push('-map_metadata', '0');
  if (settings.format === 'm4a') args.push('-movflags', '+faststart');
  args.push(outputPath);
  return args;
};

const getCommandArguments = (source: SourceFile, requestedOutputPath?: string, forceSoftwareDecode = false) => {
  const settings = getSettings(source);
  const outputPath = requestedOutputPath ?? (isMetadataOnly(settings)
    ? metadataTemporaryPath(source.path, 0)
    : makeOutputPath(source));
  if (isAudioWorkflow(source)) return audioCommandArguments(source, settings, outputPath);
  if (isMetadataOnly(settings)) {
    return sourceHasMetadataChanges(source, settings)
      ? metadataOnlyArguments(source, settings, outputPath)
      : [];
  }
  if (settings.processing.video && !settings.encoder) return null;
  const hardwareInput = settings.processing.video
    ? hardwareInputArguments(source, settings, forceSoftwareDecode)
    : { args: [] as string[], cropHandledByDecoder: false, backend: 'software' as const };
  const args = settings.processing.video
    ? [...strictVideoTranscodeArguments(), ...hardwareInput.args]
    : [...hardwareInput.args];
  args.push('-i', source.path);
  const subtitleTracks = source.media?.subtitles ?? [];
  if (settings.processing.subtitles) args.push(...externalSubtitleInputArguments(subtitleTracks));
  if (settings.processing.video) {
    args.push('-map', `0:${source.media?.video?.index ?? 0}`, '-c:v', settings.encoder);
  args.push(...encoderSpeedArguments(settings.encoder, settings.encoderSpeed));
  args.push(...encoderTuneArguments(settings.encoder, settings.encoderTune));
  if (settings.encoder.endsWith('_nvenc')) args.push('-rc:v', 'vbr', '-cq:v', settings.quality);
  else if (settings.encoder.endsWith('_qsv')) args.push('-global_quality:v', settings.quality);
  else if (settings.encoder.endsWith('_amf')) args.push('-rc:v', 'qvbr', '-qvbr_quality_level:v', settings.quality);
  else if (settings.encoder.endsWith('_vaapi')) args.push('-qp:v', settings.quality);
  else if (settings.encoder.endsWith('_videotoolbox')) args.push('-q:v', settings.quality);
  else args.push('-crf', settings.quality);
  args.push(...advancedVideoArguments(settings.encoder, settings.advancedVideo));
  const bitrateControl = builtInPreset(settings.preset)?.bitrateControl ?? true;
  if (bitrateControl) {
    args.push('-b:v', Number(settings.videoBitrate) > 0 ? `${settings.videoBitrate}k` : '0');
    if (Number(settings.maxRate) > 0) args.push('-maxrate:v', `${settings.maxRate}k`);
    if (Number(settings.bufferSize) > 0) args.push('-bufsize:v', `${settings.bufferSize}k`);
  }
  const filters: string[] = [];
  const video = source.media?.video;
  const toneMap = Boolean(settings.filters.toneMapHdrToSdr && (video?.hasHdr || video?.hasDolbyVision));
  const outputCodec = preferredCodecForEncoder(settings.encoder);
  const hevcOutput = outputCodec === 'HEVC';
  const canUse10Bit = hevcOutput && encoderCanOutput10Bit(settings.encoder);
  const main10Output = settings.filters.pixelFormat10Bit && canUse10Bit;
  const profile = outputEncoderProfile(
    outputCodec,
    settings.encoderProfile || (isMusicVideoWorkflow(source) ? musicVideoEncoderProfile(outputCodec, main10Output) ?? '' : ''),
    main10Output,
  );
  if (profile) args.push('-profile:v:0', profile);
  const toneMapFormat: 'nv12' | 'p010le' = main10Output ? 'p010le' : 'nv12';
  const dimensions = hardwareScaleDimensions(source, settings);
  const crop = detectedCropForSource(source);
  const cudaCrop = hardwareInput.backend === 'cuda' && settings.filters.autoCrop
    && !hardwareInput.cropHandledByDecoder ? crop : null;
  if (settings.filters.autoCrop && crop && !hardwareInput.cropHandledByDecoder && !cudaCrop) {
    filters.push(`crop=${crop.filter}`);
  }

  if (hardwareInput.backend === 'cuda') {
    if (cudaCrop) {
      filters.push(...cudaCropBridgeFilters(cudaCrop.filter, Boolean(video?.pixelFormat.includes('10'))));
    }
    if (dimensions) {
      filters.push(cudaScaleFilter(dimensions[0], dimensions[1], !toneMap && main10Output));
    }
    if (toneMap) {
      if (video?.hasDolbyVision) {
        filters.push('setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc');
      }
      filters.push(`tonemap_cuda=format=${toneMapFormat}:p=bt709:t=bt709:m=bt709:tonemap=bt2390:peak=100:desat=0`);
    } else if (main10Output && !dimensions) {
      filters.push(cudaScaleFilter('iw', 'ih', true));
    } else if (!dimensions && !toneMap && !cudaCrop) {
      filters.push(`${cudaScaleFilter('iw', 'ih', false)}:passthrough=0`);
    }
  } else if (hardwareInput.backend === 'qsv' && (dimensions || toneMap || main10Output)) {
    if (toneMap && video?.hasDolbyVision) {
      filters.push('setparams=color_primaries=bt2020:color_trc=smpte2084:colorspace=bt2020nc');
    }
    filters.push(hardwareUploadFilter());
    const options = [
      ...(dimensions ? [`w=${dimensions[0]}`, `h=${dimensions[1]}`] : []),
      ...(toneMap || main10Output ? [`format=${toneMapFormat}`] : []),
      ...(toneMap ? ['tonemap=1'] : []),
    ];
    filters.push(`vpp_qsv=${options.join(':')}`);
  } else if (hardwareInput.backend === 'amf' && dimensions) {
    filters.push(hardwareUploadFilter());
    const outputFormat = !toneMap && main10Output ? ':format=p010le' : '';
    filters.push(`vpp_amf=w=${dimensions[0]}:h=${dimensions[1]}${outputFormat}`);
    if (toneMap) {
      const downloadFormat = video?.pixelFormat.includes('10') ? 'p010le' : 'nv12';
      filters.push('hwdownload', `format=${downloadFormat}`, ...softwareToneMapFilters(Boolean(video?.hasDolbyVision), toneMapFormat));
    }
  } else if (hardwareInput.backend === 'vaapi') {
    const scale = softwareScaleFilter(source, settings);
    if (scale) filters.push(scale);
    if (toneMap) filters.push(...softwareToneMapFilters(Boolean(video?.hasDolbyVision), toneMapFormat));
    filters.push(`format=${main10Output ? 'p010le' : 'nv12'}`, hardwareUploadFilter());
  } else {
    const scale = softwareScaleFilter(source, settings);
    if (scale) filters.push(scale);
    if (toneMap) filters.push(...softwareToneMapFilters(Boolean(video?.hasDolbyVision), toneMapFormat));
    else if (main10Output) filters.push('format=p010le');
  }
    if (filters.length) args.push('-filter:v:0', filters.join(','));
    args.push(...frameRateConversionArguments(
      video?.frameRate,
      settings.frameRateOverride ? settings.frameRate : 'passthrough',
    ));
    addStreamMetadataArguments(args, 'v', 0, settings.videoMetadata);
  } else if (source.media?.video) {
    args.push('-map', `0:${source.media.video.index}`, '-c:v', 'copy');
    addStreamMetadataArguments(args, 'v', 0, copyMetadata(source.media.video.language, source.media.video.flags));
  }
  if (isMusicVideoWorkflow(source)) {
    args.push(...attachedCoverArtArguments(source.media?.coverArtStreamIndexes ?? []));
  }
  let audioOutputIndex = 0;
  let stereoDefaultAssigned = false;
  if (settings.processing.audio) orderByFlags(source.media?.audio ?? [], (track) => settings.audio[track.index]?.flags ?? track.flags).forEach((track) => {
    const audio = settings.audio[track.index];
    if (!audio?.enabled) return;
    const originalIndex = audioOutputIndex++;
    args.push('-map', `0:${track.index}`, `-c:a:${originalIndex}`, audio.codec);
    if (audio.codec !== 'copy') {
      args.push(`-b:a:${originalIndex}`, audio.bitrate);
      addEncodedAudioFilterArguments(
        args, originalIndex, track, !settings.filters.doNotReplaceAudio && !track.isStereo,
        settings.filters.dynamicRangeCompression,
      );
    }
    args.push(`-metadata:s:a:${originalIndex}`, `language=${audio.metadata.language}`);
    const originalFlags = settings.filters.doNotReplaceAudio
      ? { default: false, forced: false, hearingImpaired: false }
      : { ...audio.flags, hearingImpaired: false };
    args.push(`-disposition:a:${originalIndex}`, dispositionValue(originalFlags));
    if (!isMusicVideoWorkflow(source)) {
      args.push(`-metadata:s:a:${originalIndex}`, 'title=', `-metadata:s:a:${originalIndex}`, 'handler_name=');
    }

    if (settings.filters.doNotReplaceAudio && !track.isStereo) {
      const stereoIndex = audioOutputIndex++;
      const stereoCodec: AudioCodec = audio.codec === 'copy'
        ? settings.format === 'webm' ? 'libopus' : 'libfdk_aac'
        : audio.codec;
      const stereoBitrate = audio.codec === 'copy'
        ? audioBitrateFor(settings.preset, stereoCodec, track.isStereo)
        : audio.bitrate;
      args.push('-map', `0:${track.index}`, `-c:a:${stereoIndex}`, stereoCodec, `-b:a:${stereoIndex}`, stereoBitrate);
      addEncodedAudioFilterArguments(args, stereoIndex, track, true, settings.filters.dynamicRangeCompression);
      if (track.language !== 'und') args.push(`-metadata:s:a:${stereoIndex}`, `language=${track.language}`);
      args.push(`-disposition:a:${stereoIndex}`, stereoDefaultAssigned ? '0' : 'default');
      if (!isMusicVideoWorkflow(source)) {
        args.push(`-metadata:s:a:${stereoIndex}`, 'title=', `-metadata:s:a:${stereoIndex}`, 'handler_name=');
      }
      stereoDefaultAssigned = true;
    }
  });
  else {
    args.push('-map', '0:a?', '-c:a', 'copy');
    (source.media?.audio ?? []).forEach((track, index) =>
      addStreamMetadataArguments(args, 'a', index, copyMetadata(track.language, track.flags)));
  }
  let subtitleOutputIndex = 0;
  if (settings.processing.subtitles) orderByFlags(subtitleTracks, (track) => settings.subtitles[track.index]?.flags ?? track.flags).forEach((track) => {
    const subtitle = settings.subtitles[track.index];
    if (!subtitle?.enabled) return;
    args.push('-map', subtitleInputSpecifier(track, subtitleTracks), `-c:s:${subtitleOutputIndex}`, settings.format === 'mp4' ? 'mov_text' : subtitle.codec);
    args.push(`-metadata:s:s:${subtitleOutputIndex}`, `language=${subtitle.metadata.language}`);
    args.push(`-disposition:s:${subtitleOutputIndex}`, dispositionValue(subtitle.flags));
    if (!isMusicVideoWorkflow(source)) {
      args.push(`-metadata:s:s:${subtitleOutputIndex}`, 'title=', `-metadata:s:s:${subtitleOutputIndex}`, 'handler_name=');
    }
    subtitleOutputIndex += 1;
  });
  else {
    args.push('-map', '0:s?', '-c:s', 'copy');
    subtitleTracks.filter((track) => !track.externalPath).forEach((track, index) =>
      addStreamMetadataArguments(args, 's', index, copyMetadata(track.language, track.flags)));
  }
  if (settings.filters.stripMetadata) args.push('-map_metadata', '-1', '-metadata', 'title=', '-metadata', 'description=', '-metadata', 'comment=', '-metadata', 'synopsis=', '-metadata', 'grouping=');
  args.push('-map_chapters', '0');
  if (settings.format === 'mp4') {
    args.push(...mp4PlaybackArguments(settings.processing.video ? preferredCodecForEncoder(settings.encoder) : null));
  }
  args.push(outputPath);
  return args;
};

const getCommand = () => {
  const source = sources[selectedIndex];
  if (!source) return '';
  const args = getCommandArguments(source);
  if (isAudioWorkflow(source) && isAudioPassthrough(getSettings(source))) {
    return getSettings(source).filters.normalizeAudio
      ? `rsgain easy -m MAX -S ${displayArgument(source.sourceRoot ?? parentPath(source.path))}`
      : '# Passthrough retains the source without conversion.';
  }
  if (!args) return '# No compatible hardware video encoder was detected.';
  if (!args.length) return '# No metadata changes have been made for this source.';
  return ['ffmpeg', ...args].map(displayArgument).join(' ');
};

const createEncodeJob = (source: SourceFile, queueIndex: number): EncodeJob | null => {
  const metadataOnly = isMetadataOnly(getSettings(source));
  const outputPath = metadataOnly ? metadataTemporaryPath(source.path, queueIndex) : makeOutputPath(source);
  const args = getCommandArguments(source, outputPath);
  if (!args) return null;
  const passthrough = isAudioWorkflow(source) && isAudioPassthrough(getSettings(source));
  if (!args.length && !passthrough) return null;
  const settings = getSettings(source);
  const softwareDecodeFallbackArgs = settings.processing.video && args.includes('-hwaccel')
    ? getCommandArguments(source, outputPath, true) ?? undefined
    : undefined;
  const audioNormalizeRoot = isAudioWorkflow(source) && settings.filters.normalizeAudio
    ? passthrough || !appSettings.separateAudioDirectory
      ? source.sourceRoot ?? parentPath(source.path)
      : outputDirectoryIsCustom ? outputDirectory : joinPath(source.sourceRoot ?? parentPath(source.path), 'converted')
    : undefined;
  const sidecarCopies = !passthrough && isAudioWorkflow(source)
    ? (source.lyricPaths ?? []).flatMap((lyricPath) => {
      const lyricOutput = joinPath(outputDirectoryFor(source), lyricPath.replace(/^.*[\\/]/, ''));
      return lyricPath.replace(/\\/g, '/').toLowerCase() === lyricOutput.replace(/\\/g, '/').toLowerCase()
        ? [] : [{ sourcePath: lyricPath, outputPath: lyricOutput }];
    })
    : undefined;
  return {
    workflow: workflowOf(source),
    sourceName: source.name,
    sourcePath: source.path,
    outputPath,
    duration: source.media?.duration ?? null,
    args,
    ...(softwareDecodeFallbackArgs ? { softwareDecodeFallbackArgs } : {}),
    ...(isMusicVideoWorkflow(source) && runtimeState?.ccextractorAvailable
      ? {
        closedCaptionFormat: settings.format === 'mp4'
          ? 'mov_text' as const
          : settings.format === 'webm' ? 'webvtt' as const : 'subrip' as const,
        optionalClosedCaptions: true,
      }
      : {}),
    ...(passthrough ? { passthrough: true } : {}),
    ...(audioNormalizeRoot ? { normalizeRoot: audioNormalizeRoot } : {}),
    ...(sidecarCopies?.length ? { sidecarCopies } : {}),
    ...(metadataOnly ? { replaceSourcePath: source.path } : {}),
  };
};

const formatElapsed = (seconds: number | null) => {
  if (seconds === null || !Number.isFinite(seconds)) return 'Calculating…';
  const whole = Math.max(0, Math.round(seconds));
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const remaining = whole % 60;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
};

const encodeStatusLabel = (job: EncodeJobProgressState) => {
  if (job.status === 'pending') return 'Pending…';
  if (job.status === 'starting') return 'Preparing…';
  if (job.status === 'encoding') return job.percent === null ? 'Encoding…' : `${job.percent.toFixed(1)}%`;
  if (job.status === 'completed') return 'Complete';
  if (job.status === 'failed') return 'Failed';
  if (job.status === 'cancelled') return 'Cancelled';
  return 'Not encoded';
};

const renderLiveFfmpegOutput = () => {
  const modal = document.querySelector<HTMLElement>('.encode-modal');
  const output = modal?.querySelector<HTMLElement>('#encode-live-output');
  if (!output || !encodeQueueProgress) return;
  const previousScrollTop = output.scrollTop;
  const followingTail = output.scrollHeight - output.scrollTop - output.clientHeight <= 12;
  const commands = encodeQueueProgress.jobs.filter((job) => job.command);
  output.replaceChildren();
  if (!commands.length) {
    const waiting = document.createElement('p');
    waiting.className = 'encode-live-waiting';
    waiting.textContent = 'Waiting for the first FFmpeg process to start…';
    output.appendChild(waiting);
    return;
  }
  commands.forEach((job) => {
    const entry = document.createElement('section');
    entry.className = 'encode-live-entry';
    const label = document.createElement('strong');
    label.textContent = `encode ${job.jobIndex} · ${job.sourceName}`;
    const command = document.createElement('pre');
    command.textContent = `$ ${formatSessionFfmpegCommand(job.command ?? [])}`;
    entry.append(label, command);
    output.appendChild(entry);
  });
  output.scrollTop = followingTail ? output.scrollHeight : previousScrollTop;
};

const renderEncodePage = () => {
  const modal = document.querySelector<HTMLElement>('.encode-modal');
  if (!modal || !encodeQueueProgress) return;
  encodePageIndex = Math.min(Math.max(encodePageIndex, 0), encodeQueueProgress.jobs.length - 1);
  const job = encodeQueueProgress.jobs[encodePageIndex];
  if (!job) return;
  const setText = (selector: string, value: string) => {
    const element = modal.querySelector<HTMLElement>(selector);
    if (element) element.textContent = value;
  };
  const active = job.status === 'starting' || job.status === 'encoding';
  const terminal = isQueueTerminal(encodeQueueProgress);
  const percent = job.percent === null ? null : Math.min(100, Math.max(0, job.percent));

  setText('#encode-position', `ENCODE ${job.jobIndex} OF ${encodeQueueProgress.jobs.length} · ${job.status.toUpperCase()}`);
  setText('#encode-source', job.sourceName);
  setText('#encode-title-elapsed', `ELAPSED ${formatElapsed(job.runTimeSeconds)}`);
  setText('#encode-percent', encodeStatusLabel(job));
  setText('#encode-bitrate', job.bitrate);
  setText('#encode-fps', job.fps);
  setText('#encode-runtime', formatElapsed(job.runTimeSeconds));
  setText('#encode-eta', job.status === 'completed' ? '00:00:00' : active ? formatElapsed(job.etaSeconds) : '—');
  setText('#encode-output-file', job.outputPath.replace(/^.*[\\/]/, ''));
  setText('#encode-output-directory', parentPath(job.outputPath));
  setText('#encode-page-number', `${job.jobIndex} / ${encodeQueueProgress.jobs.length}`);

  const progressBar = modal.querySelector<HTMLElement>('#encode-progress');
  progressBar?.classList.toggle('indeterminate', active && percent === null);
  const fill = progressBar?.querySelector<HTMLElement>('span');
  if (fill) fill.style.width = `${percent ?? (active ? 36 : 0)}%`;

  renderLiveFfmpegOutput();

  const error = modal.querySelector<HTMLElement>('#encode-error');
  const message = job.message ?? (terminal ? encodeQueueProgress.message : undefined);
  if (error) {
    error.hidden = !message;
    error.textContent = message ?? '';
  }

  const previous = modal.querySelector<HTMLButtonElement>('#encode-previous');
  const next = modal.querySelector<HTMLButtonElement>('#encode-next');
  if (previous) previous.disabled = encodePageIndex === 0;
  if (next) next.disabled = encodePageIndex === encodeQueueProgress.jobs.length - 1;

  const jobAction = modal.querySelector<HTMLButtonElement>('#encode-job-action');
  if (jobAction) {
    jobAction.hidden = false;
    jobAction.disabled = false;
    jobAction.className = 'secondary-button encode-dialog-button';
    if (active) {
      jobAction.dataset.action = 'cancel-job';
      jobAction.classList.add('encode-cancel');
      jobAction.disabled = encodeCancellingJobs.has(job.jobIndex);
      jobAction.textContent = jobAction.disabled ? 'Cancelling encode…' : 'Cancel encode';
    } else if (job.status === 'completed') {
      jobAction.dataset.action = 'show-job';
      jobAction.dataset.path = job.outputPath;
      jobAction.textContent = 'Show in folder';
    } else {
      jobAction.dataset.action = 'status';
      jobAction.disabled = true;
      jobAction.textContent = encodeStatusLabel(job);
    }
  }

  const queueAction = modal.querySelector<HTMLButtonElement>('#encode-queue-action');
  if (queueAction) {
    if (!terminal) {
      queueAction.dataset.action = 'cancel-all';
      queueAction.className = 'encode-cancel encode-dialog-button';
      queueAction.disabled = encodeCancelAllRequested;
      queueAction.textContent = encodeCancelAllRequested ? 'Cancelling all…' : 'Cancel all active encodes';
    } else {
      queueAction.dataset.action = 'start-new';
      queueAction.className = 'encode-button encode-dialog-button';
      queueAction.disabled = false;
      queueAction.textContent = 'Start New';
    }
  }
  const doneAction = modal.querySelector<HTMLButtonElement>('#encode-done-action');
  if (doneAction) {
    doneAction.hidden = !canFinishEncodeQueue(encodeQueueProgress);
    doneAction.disabled = false;
    doneAction.textContent = 'Done';
  }
};

const startNewEncode = async () => {
  const previewIds = sources.flatMap((source) => source.previewId ? [source.previewId] : []);
  document.querySelector<HTMLButtonElement>('#encode-queue-action')?.setAttribute('disabled', 'true');
  await window.mediaAPI.releasePreviews(previewIds).catch(() => undefined);
  sources = [];
  settingsByPath.clear();
  selectedIndex = 0;
  activeTab = 'Summary';
  outputDirectory = '';
  outputDirectoryIsCustom = false;
  encodingActive = false;
  pickerBusy = false;
  sourceMode = null;
  folderSeriesLayout = null;
  encodeQueueProgress = null;
  encodePageIndex = 0;
  encodePagePinned = false;
  encodeCancelAllRequested = false;
  encodeCancellingJobs.clear();
  appSettings.lastPreset = 'Streaming';
  appSettings.lastSourceDirectory = '';
  appSettings.workingPreset = null;
  await persistAppSettings().catch(() => undefined);
  document.body.classList.remove('picker-busy');
  document.body.setAttribute('aria-busy', 'false');
  document.querySelector('.picker-progress')?.remove();
  document.querySelector('.encode-modal')?.remove();
  renderWelcome();
};

const showEncodeDialog = (jobs: EncodeJob[]) => {
  document.querySelector('.encode-modal')?.remove();
  encodeQueueProgress = createEncodeQueueProgress(jobs);
  encodePageIndex = 0;
  encodePagePinned = false;
  encodeCancelAllRequested = false;
  encodeCancellingJobs.clear();
  const modal = document.createElement('div');
  modal.className = 'encode-modal';
  modal.innerHTML = `<section><header><div><span id="encode-position"></span><h2 id="encode-source"></h2></div><div class="encode-title-status"><small id="encode-title-elapsed">ELAPSED 00:00:00</small><strong id="encode-percent"></strong></div></header>
    <div class="encode-progress indeterminate" id="encode-progress"><span></span></div>
    <div class="encode-stats"><div><span>CURRENT BITRATE</span><strong id="encode-bitrate">—</strong></div><div><span>FPS</span><strong id="encode-fps">—</strong></div><div><span>RUN TIME</span><strong id="encode-runtime">00:00:00</strong></div><div><span>ETA</span><strong id="encode-eta">Calculating…</strong></div></div>
    <div class="encode-output"><div><span>OUTPUT FILE</span><strong id="encode-output-file"></strong></div><div><span>DIRECTORY</span><strong id="encode-output-directory"></strong></div></div>
    <pre class="encode-error" id="encode-error" hidden></pre>
    <div class="encode-live-console" id="encode-live-console" hidden><div class="encode-live-title"><span><i></i> LIVE PROCESS OUTPUT</span><small>Current processing session · paths redacted</small></div><div class="encode-live-output" id="encode-live-output"></div></div>
    <footer><div class="encode-pagination"><button id="encode-previous" aria-label="Previous encode">Previous</button><strong id="encode-page-number"></strong><button id="encode-next" aria-label="Next encode">Next</button><button class="encode-live-button" id="toggle-live-output" aria-expanded="false">Live Process Output</button></div><div class="encode-modal-actions"><button class="secondary-button encode-dialog-button" id="encode-job-action"></button><button class="encode-cancel encode-dialog-button" id="encode-queue-action">Cancel all active encodes</button><button class="secondary-button encode-dialog-button" id="encode-done-action" hidden>Done</button></div></footer></section>`;
  document.body.appendChild(modal);
  modal.querySelector<HTMLButtonElement>('#toggle-live-output')?.addEventListener('click', (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const consolePanel = modal.querySelector<HTMLElement>('#encode-live-console');
    const expanded = button.getAttribute('aria-expanded') === 'true';
    button.setAttribute('aria-expanded', String(!expanded));
    button.classList.toggle('active', !expanded);
    if (consolePanel) consolePanel.hidden = expanded;
    if (!expanded) renderLiveFfmpegOutput();
  });
  modal.querySelector('#encode-previous')?.addEventListener('click', () => {
    encodePageIndex -= 1;
    encodePagePinned = true;
    renderEncodePage();
  });
  modal.querySelector('#encode-next')?.addEventListener('click', () => {
    encodePageIndex += 1;
    encodePagePinned = true;
    renderEncodePage();
  });
  modal.querySelector<HTMLButtonElement>('#encode-job-action')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    const job = encodeQueueProgress?.jobs[encodePageIndex];
    if (!job) return;
    if (button.dataset.action === 'show-job') {
      void window.mediaAPI.showInFolder(job.outputPath);
      return;
    }
    if (button.dataset.action === 'cancel-job') {
      encodeCancellingJobs.add(job.jobIndex);
      renderEncodePage();
      const cancelled = await window.mediaAPI.cancelEncode(job.jobIndex);
      if (!cancelled) {
        encodeCancellingJobs.delete(job.jobIndex);
        renderEncodePage();
        showToast('That encode is no longer active');
      }
    }
  });
  modal.querySelector<HTMLButtonElement>('#encode-queue-action')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.dataset.action === 'start-new') {
      button.disabled = true;
      button.textContent = 'Starting new…';
      await startNewEncode();
      return;
    }
    if (button.dataset.action === 'cancel-all') {
      encodeCancelAllRequested = true;
      renderEncodePage();
      const cancelled = await window.mediaAPI.cancelEncode();
      if (!cancelled) {
        encodeCancelAllRequested = false;
        renderEncodePage();
      }
    }
  });
  modal.querySelector<HTMLButtonElement>('#encode-done-action')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (!encodeQueueProgress || !canFinishEncodeQueue(encodeQueueProgress)) return;
    button.disabled = true;
    button.textContent = 'Closing…';
    await window.mediaAPI.finishAndClose().catch(() => {
      button.disabled = false;
      button.textContent = 'Done';
      showToast('Unable to close the application cleanly');
    });
  });
  renderEncodePage();
};

const updateEncodeDialog = (progress: EncodeProgress) => {
  if (!encodeQueueProgress) return;
  encodeQueueProgress = applyEncodeProgress(encodeQueueProgress, progress);
  encodeCancellingJobs.delete(progress.jobIndex);
  if (progress.phase === 'starting' && !encodePagePinned) encodePageIndex = progress.jobIndex - 1;
  if (isQueueTerminal(encodeQueueProgress)) {
    encodingActive = false;
    encodeCancelAllRequested = false;
    const completedIndex = encodeQueueProgress.jobs.findLastIndex((job) => job.status === 'completed');
    if (!encodePagePinned && completedIndex >= 0) encodePageIndex = completedIndex;
  }
  renderEncodePage();
};

const startEncoding = async () => {
  if (encodingActive) return;
  if (!runtimeState?.ffmpegAvailable) { showToast('FFmpeg is unavailable'); return; }
  const metadataOnlyQueue = sources.every((source) => isMetadataOnly(getSettings(source)));
  const jobSources = metadataOnlyQueue
    ? sources.filter((source) => sourceHasMetadataChanges(source))
    : sources;
  if (metadataOnlyQueue && !jobSources.length) {
    showToast('Change metadata on at least one source before updating');
    return;
  }
  if (metadataOnlyQueue && !window.confirm(
    `Update metadata for ${jobSources.length} file${jobSources.length === 1 ? '' : 's'}?\n\n`
    + 'Each original file will be replaced only after FFmpeg creates a complete temporary copy.',
  )) return;
  const pendingJobs = jobSources.map(createEncodeJob);
  if (pendingJobs.some((job) => job === null)) { showToast('No compatible hardware encoder is available'); return; }
  const jobs = pendingJobs.filter((job): job is EncodeJob => job !== null);
  if (!jobs.length) { showToast('There are no media files to process'); return; }
  encodingActive = true;
  showEncodeDialog(jobs);
  const result = await window.mediaAPI.startEncode(jobs, appSettings.simultaneousEncoding).catch((error: unknown) => ({
    started: false,
    message: error instanceof Error ? error.message : 'Unable to start encoding.',
  }));
  if (!result.started) {
    encodingActive = false;
    document.querySelector('.encode-modal')?.remove();
    showToast(result.message ?? 'Unable to start encoding');
    return;
  }
};

const renderBootstrap = (state?: RuntimeState) => {
  const progress = state?.progress;
  app.innerHTML = `<main class="bootstrap-shell"><div class="bootstrap-titlebar">${windowControls()}</div><div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <section class="bootstrap-card"><div class="brand bootstrap-brand"><span class="brand-mark">${icon('app', 24)}</span><span>EA Media Tools</span></div>
      <div class="runtime-orbit ${state?.phase === 'error' ? 'error' : ''}"><div class="runtime-orbit-inner">${state?.phase === 'error' ? icon('x', 25) : icon('film', 25)}</div></div>
      <div class="eyebrow">${state?.phase === 'error' ? 'RUNTIME CHECK FAILED' : 'PREPARING YOUR WORKSPACE'}</div><h1>${state?.phase === 'error' ? 'FFmpeg needs attention' : 'Getting things ready'}</h1>
      <p>${escapeHtml(state?.message ?? 'Checking for EA Media Tools updates')}</p><div class="runtime-progress ${progress === null || progress === undefined ? 'indeterminate' : ''}"><span style="width:${progress ?? 36}%"></span></div>
      <small>${state?.isPackaged === false ? 'Development mode · remote downloads are disabled' : `EA Media Tools ${escapeHtml(state?.appVersion ?? '')}`}</small></section></main>`;
  bindWindowControls();
};

const windowControls = () => `<div class="window-controls"><button class="window-button" data-window-minimize aria-label="Minimize">${icon('minus', 17)}</button><button class="window-button close" data-window-close aria-label="Close">${icon('x', 17)}</button></div>`;
const bindWindowControls = () => {
  document.querySelectorAll('[data-window-minimize]').forEach((button) => button.addEventListener('click', () => void window.mediaAPI.minimizeWindow()));
  document.querySelectorAll('[data-window-close]').forEach((button) => button.addEventListener('click', () => void window.mediaAPI.closeWindow()));
  document.querySelectorAll('[data-app-settings]').forEach((button) => button.addEventListener('click', (event) => {
    event.stopPropagation();
    showAppMenu();
  }));
};
const showAppMenu = () => {
  document.querySelector('.app-menu')?.remove();
  const menu = document.createElement('div');
  menu.className = 'app-menu';
  const runtimeSelector = sources.length === 0 && Boolean(document.querySelector('.welcome-shell'))
    ? `<label class="menu-check runtime-channel-toggle"><input id="stable-ffmpeg" type="checkbox"${checked(appSettings.useStableFfmpeg)}/><span><strong>Stable</strong><small>Use the stable Jellyfin FFmpeg runtime</small></span></label>`
    : '';
  const simultaneousSelector = sources.length > 1 && !document.querySelector('.welcome-shell')
    ? `<label class="menu-check simultaneous-encoding-toggle"><input id="simultaneous-encoding" type="checkbox"${checked(appSettings.simultaneousEncoding)}/><span><strong>Simultaneous encoding</strong><small>Process compatible batch files in parallel</small></span></label>`
    : '';
  menu.innerHTML = `<div class="menu-identity"><strong>EA Media Tools</strong><span>Version ${escapeHtml(runtimeState?.appVersion ?? '2.5.0')} · ${APP_CODENAME}</span></div>${runtimeSelector}${simultaneousSelector}<label class="menu-check"><input id="hardware-acceleration" type="checkbox"${checked(appSettings.hardwareAcceleration)}/><span>Hardware Acceleration</span></label><button id="view-logs">View Logs</button><button id="view-config">View Running Config</button><button id="view-changelog">View Change Log</button><button id="check-update">Check for update</button><button class="danger" id="exit-app">Exit</button>`;
  document.body.appendChild(menu);
  menu.addEventListener('click', (event) => event.stopPropagation());
  menu.querySelector<HTMLInputElement>('#stable-ffmpeg')?.addEventListener('change', async (event) => {
    const control = event.currentTarget as HTMLInputElement;
    const useStable = control.checked;
    const previousUseStable = appSettings.useStableFfmpeg;
    control.disabled = true;
    try {
      const selectedRuntime = await window.mediaAPI.selectRuntimeChannel(useStable);
      runtimeState = selectedRuntime;
      appSettings.useStableFfmpeg = useStable;
      hardwareCapabilities = {
        checkedAt: '', adapters: [], ignoredAdapters: [], cudaAvailable: false, nvdecAvailable: false,
        cuvidDecoders: [], amfDecodeAvailable: false, qsvDecodeAvailable: false,
        qsvDecoders: [], vaapiAvailable: false, vaapiDevice: null, encoders: [],
      };
      if (selectedRuntime.ffmpegAvailable) {
        try { hardwareCapabilities = await window.mediaAPI.detectHardware(); } catch { /* Keep an empty capability set. */ }
      }
      await window.mediaAPI.saveSettings(appSettings);
      menu.remove();
      renderWelcome();
      showToast(`${useStable ? 'Stable' : 'Pre-release'} FFmpeg selected`);
    } catch (error) {
      appSettings.useStableFfmpeg = previousUseStable;
      try {
        runtimeState = await window.mediaAPI.selectRuntimeChannel(previousUseStable);
        if (runtimeState.ffmpegAvailable) hardwareCapabilities = await window.mediaAPI.detectHardware();
        await window.mediaAPI.saveSettings(appSettings);
      } catch {
        // Preserve the original channel-change failure for the user.
      }
      control.checked = previousUseStable;
      control.disabled = false;
      showToast(error instanceof Error ? error.message : 'Unable to change FFmpeg runtime');
    }
  });
  menu.querySelector<HTMLInputElement>('#simultaneous-encoding')?.addEventListener('change', (event) => {
    appSettings.simultaneousEncoding = (event.currentTarget as HTMLInputElement).checked;
    void persistAppSettings();
    showToast(appSettings.simultaneousEncoding ? 'Simultaneous encoding enabled' : 'Encodes will run one at a time');
  });
  menu.querySelector<HTMLInputElement>('#hardware-acceleration')?.addEventListener('change', async (event) => {
    appSettings.hardwareAcceleration = (event.currentTarget as HTMLInputElement).checked;
    const source = sources[selectedIndex];
    if (appSettings.hardwareAcceleration && runtimeState?.ffmpegAvailable) {
      try { hardwareCapabilities = await window.mediaAPI.detectHardware(); } catch { /* Software remains available. */ }
    }
    for (const item of sources) {
      const itemSettings = getSettings(item);
      if (isAudioWorkflow(item)) continue;
      itemSettings.encoder = appSettings.hardwareAcceleration
        ? hardwareEncoderFor(preferredCodecForEncoder(itemSettings.encoder))
        : softwareEncoderFor(preferredCodecForEncoder(itemSettings.encoder));
      const defaults = builtInPreset(itemSettings.preset);
      if (defaults) {
        const outputProfile = outputProfileFor(item, itemSettings.filters.scale, defaults.name);
        itemSettings.encoderTune = normalizeEncoderTune(itemSettings.encoder, presetTune(defaults, itemSettings.encoder));
        itemSettings.quality = deliveryQuality(defaults, outputProfile.tier, itemSettings.encoder);
      } else {
        itemSettings.encoderTune = normalizeEncoderTune(itemSettings.encoder, itemSettings.encoderTune);
      }
    }
    void persistAppSettings();
    updateCommand();
    if (source) renderWorkspace();
  });
  menu.querySelector('#view-logs')?.addEventListener('click', () => void showTextReader(
    'EA Media Tools activity log', 'app.log · newest entries at bottom', () => window.mediaAPI.readLog(),
  ));
  menu.querySelector('#view-config')?.addEventListener('click', () => void showTextReader(
    'EA Media Tools running config', 'config · user settings and active custom working state', () => window.mediaAPI.readConfig(appSettings),
  ));
  menu.querySelector('#view-changelog')?.addEventListener('click', () => void showTextReader(
    `EA Media Tools ${runtimeState?.appVersion ?? '2.5.0'} change log`,
    `${APP_CODENAME} · installed release notes from GitHub`,
    () => window.mediaAPI.readChangelog(),
  ));
  menu.querySelector('#check-update')?.addEventListener('click', async () => {
    showToast('Checking for updates…');
    showToast(await window.mediaAPI.checkForUpdates());
  });
  menu.querySelector('#exit-app')?.addEventListener('click', () => void window.mediaAPI.closeWindow());
  window.setTimeout(() => document.addEventListener('click', () => menu.remove(), { once: true }), 0);
};
const showTextReader = async (title: string, subtitle: string, load: () => Promise<string>) => {
  document.querySelector('.log-modal')?.remove();
  const modal = document.createElement('div');
  modal.className = 'log-modal';
  modal.innerHTML = `<section><header><div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(subtitle)}</span></div><button id="close-log">${icon('x', 18)}</button></header><pre>Loading…</pre></section>`;
  document.body.appendChild(modal);
  const contents = await load().catch((error: unknown) =>
    `Unable to load this document.\n\n${error instanceof Error ? error.message : String(error)}`);
  const output = modal.querySelector('pre');
  if (output) { output.textContent = contents; output.scrollTop = output.scrollHeight; }
  modal.querySelector('#close-log')?.addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (event) => { if (event.target === modal) modal.remove(); });
};

const renderWelcome = () => {
  const ffmpegLabel = runtimeState?.ffmpegAvailable
    ? `${runtimeState.ffmpegChannel === 'stable' ? 'Stable' : 'Pre-release'} · Jellyfin FFmpeg ${escapeHtml((runtimeState.releaseTag ?? runtimeState.ffmpegVersion ?? 'ready').replace(/^v/i, ''))}`
    : 'FFmpeg unavailable';
  const statusClass = !runtimeState?.ffmpegAvailable
    ? 'danger'
    : runtimeState.ffmpegChannel === 'unstable' ? 'warning' : '';
  app.innerHTML = `<main class="welcome-shell"><div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
    <header class="welcome-nav"><div class="brand"><span class="brand-mark">${icon('app', 22)}</span><span>EA Media Tools</span></div><div class="title-actions"><button class="icon-button" data-app-settings aria-label="Settings">${icon('settings', 19)}</button>${windowControls()}</div></header>
    <section class="welcome-content"><div class="eyebrow">${icon('sparkles', 15)} MEDIA CONVERSION, MADE SIMPLE</div><h1>What would you like<br>to <span>convert?</span></h1>
      <p class="welcome-copy">Start with one or more video or music files, or an entire folder.<br>Audio folders preserve artist and album subdirectories.</p>
      <div class="source-actions"><button class="source-card primary" id="open-file"><span class="source-icon">${icon('file', 30)}</span><span class="source-text"><strong>Open media files</strong><small>Select video or audio files</small></span><span class="source-arrow">${icon('chevron', 19)}</span></button>
      <button class="source-card" id="open-folder"><span class="source-icon">${icon('folder', 30)}</span><span class="source-text"><strong>Open a media folder</strong><small>Video batch or recursive audio library</small></span><span class="source-arrow">${icon('chevron', 19)}</span></button></div>
      <div class="format-strip"><span>MEDIA INPUT</span><b>MP4</b><b>MKV</b><b>FLAC</b><b>ALAC</b><b>MP3</b><b>+ MORE</b></div></section>
    <footer class="welcome-footer"><span>EA Media Tools ${escapeHtml(runtimeState?.appVersion ?? '')} · ${APP_CODENAME}</span><span class="status-dot ${statusClass}"></span><span>${ffmpegLabel}</span></footer></main>`;
  document.querySelector('#open-file')?.addEventListener('click', () => void pickSource('file'));
  document.querySelector('#open-folder')?.addEventListener('click', () => void pickSource('folder'));
  bindWindowControls();
};

const setPickerBusy = (busy: boolean, type?: 'file' | 'folder') => {
  pickerBusy = busy;
  document.body.classList.toggle('picker-busy', busy);
  document.body.setAttribute('aria-busy', String(busy));
  document.querySelector('.picker-progress')?.remove();
  if (busy) {
    const progress = document.createElement('div');
    progress.className = 'picker-progress';
    progress.setAttribute('role', 'status');
    progress.setAttribute('aria-live', 'polite');
    progress.innerHTML = `<div class="picker-progress-orbit"><span>${icon(type === 'folder' ? 'folder' : 'file', 28)}</span></div><strong id="picker-progress-title">Inspecting selected ${type === 'folder' ? 'folder' : 'media'}</strong><small id="picker-progress-detail">Reading streams, metadata, and conversion details&hellip;</small>`;
    document.body.appendChild(progress);
  }
  document.querySelectorAll<HTMLButtonElement>('button').forEach((button) => {
    if (busy) { button.dataset.pickerWasDisabled = String(button.disabled); button.disabled = true; }
    else { button.disabled = button.dataset.pickerWasDisabled === 'true'; delete button.dataset.pickerWasDisabled; }
  });
};
const updatePickerProgress = (progress: SourceScanProgress) => {
  if (!pickerBusy) return;
  const title = document.querySelector<HTMLElement>('#picker-progress-title');
  const detail = document.querySelector<HTMLElement>('#picker-progress-detail');
  if (!title || !detail) return;
  if (progress.phase === 'discovering') {
    title.textContent = `Scanning folder · ${progress.completed.toLocaleString()} media files found`;
    detail.textContent = 'Searching subfolders while keeping the app responsive…';
    return;
  }
  const count = `${progress.completed.toLocaleString()} of ${(progress.total ?? 0).toLocaleString()}`;
  title.textContent = progress.phase === 'indexing' ? `Preparing files · ${count}` : `Inspecting media · ${count}`;
  detail.textContent = progress.currentName ?? (progress.phase === 'indexing'
    ? 'Reading file details…'
    : 'Reading streams, metadata, and conversion details…');
};
const requestSources = async (type: 'file' | 'folder') => {
  if (pickerBusy) return [];
  setPickerBusy(true, type);
  await new Promise<void>((resolve) => window.requestAnimationFrame(() =>
    window.requestAnimationFrame(() => resolve())));
  try { return type === 'file'
    ? await window.mediaAPI.openFile(appSettings.lastSourceDirectory)
    : await window.mediaAPI.openFolder(appSettings.lastSourceDirectory); }
  finally { setPickerBusy(false); }
};
const pickSource = async (type: 'file' | 'folder') => {
  const newSources = await requestSources(type);
  if (!newSources.length) return;
  await window.mediaAPI.releasePreviews(sources.flatMap((source) => source.previewId ? [source.previewId] : []));
  sources.forEach((source) => settingsByPath.delete(source.path));
  sourceMode = type;
  folderSeriesLayout = type === 'folder' ? detectFolderSeriesLayout(newSources) : null;
  const workflow = workflowOf(newSources[0]);
  appSettings.lastPreset = workflow === 'music-video' ? 'Music Video' : 'Streaming';
  appSettings.workingPreset = null;
  appSettings.lastSourceDirectory = newSources[0].sourceRoot ?? parentPath(newSources[0].path);
  if (workflow === 'audio') appSettings.separateAudioDirectory = true;
  if (workflow === 'audio' || workflow === 'music-video') appSettings.smartFileNaming = false;
  void persistAppSettings();
  sources = newSources; selectedIndex = 0; activeTab = 'Summary'; outputDirectoryIsCustom = false;
  sources.forEach((item) => applyPreset(item, appSettings.lastPreset, false));
  outputDirectory = makeDefaultOutputDirectory(sources[0]);
  renderWorkspace();
};
const audioSummary = (source: SourceFile) => {
  const tracks = source.media?.audio ?? [];
  if (!tracks.length) return 'None';
  return tracks.length === 1 ? tracks[0].codecLabel : `${tracks.length} tracks`;
};
const subtitleSummary = (source: SourceFile) => {
  const subtitles = source.media?.subtitles ?? [];
  if (!subtitles.length) return 'None';
  const text = subtitles.filter((track) => track.kind === 'text').length, image = subtitles.length - text;
  return `${subtitles.length} track${subtitles.length === 1 ? '' : 's'} · ${text} text${image ? ` · ${image} image` : ''}`;
};

const renderWorkspace = () => {
  const previousScrollTop = document.querySelector<HTMLElement>('.work-area')?.scrollTop ?? 0;
  const source = sources[selectedIndex];
  if (!source) return renderWelcome();
  const settings = getSettings(source);
  const decoder = decoderStatus(source, settings);
  const metadataOnly = isMetadataOnly(settings);
  const metadataEditCount = sources.filter((item) => isMetadataOnly(getSettings(item)) && sourceHasMetadataChanges(item)).length;
  const outputFileName = makeOutputFileName(source);
  const audioWorkflow = isAudioWorkflow(source);
  const musicVideo = isMusicVideoWorkflow(source);
  const passthrough = audioWorkflow && isAudioPassthrough(settings);
  const tabs = (audioWorkflow
    ? [['Summary', 'audio'], ['Audio', 'audio'], ['Filters', 'sliders']]
    : [['Summary', 'film'], ['Video', 'video'], ['Audio', 'audio'], ['Subtitles', 'captions'], ['Filters', 'sliders']]) as Array<[string, IconName]>;
  const fileRows = sources.map((file, index) => `<button class="source-row ${index === selectedIndex ? 'active' : ''}" data-source-index="${index}"><span class="file-type">${escapeHtml(file.extension.slice(0, 4))}</span><span class="source-row-copy"><strong>${escapeHtml(file.name)}</strong><small>${formatSize(file.size)}</small></span>${index === selectedIndex ? '<span class="active-pip"></span>' : ''}</button>`).join('');
  const video = source.media?.video;
  const showWorkingCustom = settings.preset === 'Custom';
  const basePresets = audioWorkflow
    ? [...AUDIO_PRESET_NAMES]
    : predefinedPresetNames(builtInPresetConfiguration?.presets ?? {}, musicVideo);
  const visiblePresets = [...basePresets, ...(showWorkingCustom ? ['Custom'] : [])];
  const savedPresets = musicVideo ? [] : appSettings.customPresets.filter((preset) =>
    audioWorkflow ? preset.workflow === 'audio' : preset.workflow !== 'audio');
  const presetDescription = audioWorkflow
    ? settings.preset === 'Streaming' ? '96 kbps Opus, or 128 kbps for a surround downmix.'
      : settings.preset === 'Archive' ? '224 kbps libfdk_aac, or 256 kbps for a surround downmix.'
        : settings.preset === 'Passthrough' ? 'Retain source audio and optionally normalize the selected library.'
          : 'Modified audio settings ready to save as a preset.'
    : musicVideo ? 'Short-form music video with preserved metadata, protected cover art, automatic captions, and 4K-only scaling.'
      : builtInPreset(settings.preset)?.description ?? (settings.preset === 'Custom' ? 'Modified settings ready to save as a preset.' : appSettings.customPresets.find((preset) => preset.name === settings.preset)?.description ?? 'Saved user preset.');
  const workflowLabel = audioWorkflow ? 'audio' : musicVideo ? 'music video' : 'video';
  const destinationToggle = audioWorkflow
    ? `<label class="smart-naming ${passthrough ? 'disabled' : ''}"><input id="separate-audio-directory" type="checkbox"${checked(!passthrough && appSettings.separateAudioDirectory)}${encodingActive || passthrough ? ' disabled' : ''}/><span>Separate encode directory</span></label>`
    : musicVideo ? '' : `<label class="smart-naming ${metadataOnly ? 'disabled' : ''}"><input id="smart-file-naming" type="checkbox"${checked(!metadataOnly && appSettings.smartFileNaming)}${encodingActive || metadataOnly ? ' disabled' : ''}/><span>${metadataOnly ? 'Original filename retained' : 'Smart file naming'}</span></label>`;
  const metadataApplyAll = metadataOnly && sourceHasMetadataChanges(source) && matchingMetadataQueueSources(source).length > 1
    ? '<button class="secondary-button metadata-apply-all" id="apply-metadata-all">Apply to all sources in queue</button>'
    : '';
  app.innerHTML = `<main class="workspace"><header class="topbar"><div class="brand"><span class="brand-mark">${icon('app', 21)}</span><span>EA Media Tools</span></div><div class="topbar-spacer"></div><div class="decoder-indicator ${decoder.hardware ? 'hardware' : 'software'}" title="${decoder.hardware ? 'Hardware decoder' : 'Software decoder'}"><span class="decoder-orb" aria-hidden="true"></span><span>${decoder.label}</span></div><button class="top-action queue-button">${icon('queue', 17)} Queue <span class="queue-count">${sources.length}</span></button><button class="icon-button" data-app-settings aria-label="Settings">${icon('settings', 18)}</button>${windowControls()}</header>
    <aside class="sidebar"><div class="sidebar-heading"><span>SOURCES</span><span>${sources.length}</span></div><div class="source-list">${fileRows}</div>${sourceMode === 'file' ? `<button class="add-more" id="add-more-videos">${icon('plus', 16)} Add more ${workflowLabel} files</button>` : ''}<div class="sidebar-tip"><span>${icon('sparkles', 17)}</span><div><strong>Batch queue active</strong><p>All selected ${workflowLabel} files are queued automatically. Preset changes apply to the entire batch.</p></div></div></aside>
    <section class="work-area"><div class="source-hero"><div class="media-preview">${source.previewDataUrl ? `<img src="${source.previewDataUrl}" alt="35 percent source preview"/>` : `<div class="preview-grid"></div><div class="preview-play">${icon(audioWorkflow ? 'audio' : 'play', 23)}</div>`}<span>${escapeHtml(source.extension)}</span></div><div class="source-info"><div class="section-label">CURRENT ${workflowLabel.toUpperCase()} SOURCE${audioWorkflow ? '' : ' · PREVIEW AT 35%'}</div><h2>${escapeHtml(source.name)}</h2><p title="${escapeHtml(source.path)}">${escapeHtml(source.path)}</p>
      <div class="metadata">${audioWorkflow ? `<span><b>Audio</b>${escapeHtml(audioSummary(source))}</span><span><b>Sample rate</b>${source.media?.audio[0]?.sampleRate ? `${source.media.audio[0].sampleRate / 1000} kHz` : 'Unknown'}</span><span><b>Channels</b>${source.media?.audio[0]?.channels ?? 'Unknown'}</span><span><b>Duration</b>${formatDuration(source.media?.duration ?? null)}</span>` : `<span><b>Video</b>${video ? `${escapeHtml(video.codec)} · ${video.width}×${video.height}` : 'Unknown'}</span><span><b>Dynamic range</b>${escapeHtml(hdrLabel(source))}</span><span><b>Audio</b>${escapeHtml(audioSummary(source))}</span><span><b>Chapters</b>${source.media?.chapterCount ?? 'Unknown'}</span><span><b>Subtitles</b>${escapeHtml(subtitleSummary(source))}</span>`}</div></div></div>
      ${source.probeError ? `<div class="probe-warning">${icon('x', 16)} ${escapeHtml(source.probeError)}</div>` : ''}
      <div class="preset-bar ${metadataOnly ? 'processing-disabled' : ''}"><div class="preset-icon">${icon('gauge', 22)}</div><label class="preset-control"><span>PRESET</span><select id="preset"${metadataOnly || musicVideo ? ' disabled' : ''}>${visiblePresets.map((preset) => `<option${selected(settings.preset === preset)}>${preset}</option>`).join('')}${savedPresets.length ? `<optgroup label="Saved presets">${savedPresets.map((preset) => `<option${selected(settings.preset === preset.name)}>${escapeHtml(preset.name)}</option>`).join('')}</optgroup>` : ''}</select><small class="preset-description">${metadataOnly ? 'Metadata-only mode copies every stream and preserves the source container.' : escapeHtml(presetDescription)}</small></label><div class="custom-preset-editor" id="custom-preset-editor"${settings.preset === 'Custom' && !metadataOnly ? '' : ' hidden'}><label><span>PRESET NAME</span><input id="custom-preset-name" value="${escapeHtml(customPresetDraftName)}" placeholder="My preset" maxlength="80"/></label><button class="save-preset" id="save-preset">Save</button></div></div>
      <nav class="tabs">${tabs.map(([label, tabIcon]) => `<button class="tab ${activeTab === label ? 'active' : ''}" data-tab="${label}">${icon(tabIcon, 17)}${label}${label === 'Audio' ? `<i>${source.media?.audio.length ?? 0}</i>` : label === 'Subtitles' ? `<i>${source.media?.subtitles.length ?? 0}</i>` : ''}</button>`).join('')}</nav><div class="tab-content" id="tab-content">${renderTabContent(activeTab, source, settings)}</div></section>
    <footer class="encode-footer"><div class="destination"><div class="destination-heading"><span>${metadataOnly ? 'SOURCE REPLACEMENT' : passthrough ? 'SOURCE LIBRARY' : 'DESTINATION'}</span></div><div class="destination-controls"><div class="destination-row"><div class="destination-path" title="${escapeHtml(outputDirectoryFor(source))}">${icon('folder', 16)}<span>${escapeHtml(outputDirectoryFor(source))}</span></div><button id="browse-output"${encodingActive || metadataOnly || passthrough ? ' disabled' : ''}>Browse</button></div>${destinationToggle}</div><small class="destination-output" title="${escapeHtml(makeOutputPath(source))}">${metadataOnly ? 'The original file will be replaced after a verified stream-copy update.' : passthrough ? 'Source audio is retained; enabled normalization runs in place.' : `Output: ${escapeHtml(outputFileName)}`}</small></div>${metadataApplyAll}<button class="encode-button ${metadataOnly ? 'metadata-update-button' : ''}" id="start-encode"${encodingActive || metadataOnly && metadataEditCount === 0 ? ' disabled' : ''}>${icon(metadataOnly ? 'check' : 'play', 17)} ${metadataOnly ? metadataEditCount ? `Update metadata (${metadataEditCount})` : 'No metadata changes' : `${passthrough ? 'Process' : 'Encode'} ${sources.length} ${workflowLabel}${sources.length === 1 ? '' : ' files'}`}</button></footer></main>`;
  bindWorkspaceEvents();
  const workArea = document.querySelector<HTMLElement>('.work-area');
  if (workArea) workArea.scrollTop = previousScrollTop;
};

const renderTabContent = (tab: string, source: SourceFile, settings: JobSettings) => {
  if (tab === 'Summary') return renderSourceSummary(source);
  if (tab === 'Video') return renderVideoSettings(source, settings);
  if (tab === 'Audio') return renderAudioSettings(source, settings);
  if (tab === 'Subtitles') return renderSubtitleSettings(source, settings);
  if (tab === 'Filters') return renderFilterSettings(source, settings);
  return `<section class="empty-panel"><div class="empty-panel-icon">${icon('sliders', 28)}</div><span>VIDEO FILTERS</span><h3>Filter controls</h3><p>Configure deinterlacing, denoise, sharpening, cropping, and color adjustments.</p><button>Configure filters</button></section>`;
};

const renderSourceSummary = (source: SourceFile) => {
  const video = source.media?.video;
  const audio = orderByFlags(source.media?.audio ?? [], (track) => track.flags);
  const subtitles = orderByFlags(source.media?.subtitles ?? [], (track) => track.flags);
  if (isAudioWorkflow(source)) {
    const track = audio[0];
    return `<div class="source-summary"><section class="details-panel"><div class="card-title"><div><span>AUDIO SOURCE</span><h3>Detected audio properties</h3></div>${icon('audio', 22)}</div><div class="detail-grid"><div><span>Codec</span><strong>${escapeHtml(track?.codecLabel ?? 'Unknown')}</strong></div><div><span>Channels</span><strong>${track?.channels ?? 'Unknown'}</strong></div><div><span>Layout</span><strong>${escapeHtml(track?.channelLayout ?? 'Unknown')}</strong></div><div><span>Sample rate</span><strong>${track?.sampleRate ? `${track.sampleRate / 1000} kHz` : 'Unknown'}</strong></div><div><span>Lossless</span><strong>${track?.isLossless ? 'Yes' : 'No'}</strong></div><div><span>Duration</span><strong>${formatDuration(source.media?.duration ?? null)}</strong></div><div><span>Lyrics</span><strong>${source.lyricPaths?.length ? 'Sidecar detected' : 'None detected'}</strong></div><div><span>Relative path</span><strong>${escapeHtml(source.relativePath ?? source.name)}</strong></div></div></section></div>`;
  }
  return `<div class="source-summary"><section class="details-panel"><div class="card-title"><div><span>VIDEO SOURCE</span><h3>Detected video properties</h3></div>${icon('video', 22)}</div><div class="detail-grid"><div><span>Codec</span><strong>${escapeHtml(video?.codec ?? 'Unknown')}</strong></div><div><span>Profile</span><strong>${escapeHtml(video?.profile ?? 'Unknown')}</strong></div><div><span>Pixel format</span><strong>${escapeHtml(video?.pixelFormat ?? 'Unknown')}</strong></div><div><span>Dimensions</span><strong>${video ? `${video.width} × ${video.height}` : 'Unknown'}</strong></div><div><span>Frame rate</span><strong>${escapeHtml(video?.frameRate ?? 'Unknown')}</strong></div><div><span>Dynamic range</span><strong>${escapeHtml(hdrLabel(source))}</strong></div><div><span>Duration</span><strong>${formatDuration(source.media?.duration ?? null)}</strong></div><div><span>Dolby Vision</span><strong>${video?.hasDolbyVision ? 'Yes' : 'No'}</strong></div><div><span>HEVC Main10</span><strong>${video?.isHevcMain10 ? 'Yes' : 'No'}</strong></div></div></section>
    <section class="details-panel summary-list"><div class="card-title"><div><span>AUDIO SOURCE</span><h3>${audio.length} detected track${audio.length === 1 ? '' : 's'}</h3></div>${icon('audio', 22)}</div>${audio.length ? audio.map((track, index) => `<div class="summary-track"><strong>${index + 1}. ${escapeHtml(track.languageLabel)}</strong><span>${escapeHtml(track.codecLabel)} · ${escapeHtml(flagsLabel(track.flags))}</span></div>`).join('') : '<p>No audio streams</p>'}</section>
    <section class="details-panel summary-list"><div class="card-title"><div><span>SUBTITLE SOURCE</span><h3>${subtitles.length} detected track${subtitles.length === 1 ? '' : 's'}</h3></div>${icon('captions', 22)}</div>${subtitles.length ? subtitles.map((track, index) => `<div class="summary-track"><strong>${index + 1}. ${escapeHtml(track.languageLabel)}</strong><span>${escapeHtml(track.codecLabel)} · ${track.kind === 'text' ? 'UTF-8 text' : 'Image based'} · ${escapeHtml(flagsLabel(track.flags))}</span></div>`).join('') : '<p>No subtitle streams</p>'}</section>
    <section class="details-panel chapter-summary"><div>${icon('film', 22)}<span>CHAPTERS</span></div><strong>${source.media?.chapterCount ? `${source.media.chapterCount} chapter${source.media.chapterCount === 1 ? '' : 's'} detected` : 'No chapters detected'}</strong></section></div>`;
};

const encoderOptions = (settings: JobSettings) => {
  if (!appSettings.hardwareAcceleration) {
    return `<option value="${escapeHtml(settings.encoder)}" selected>CPU · ${escapeHtml(settings.encoder)}</option>`;
  }
  const hardware = hardwareCapabilities.encoders;
  return hardware.length
    ? `<optgroup label="Detected hardware">${hardware.map((encoder) => `<option value="${encoder.id}"${selected(settings.encoder === encoder.id)}>${escapeHtml(encoder.label)}</option>`).join('')}</optgroup>`
    : '<option value="" selected disabled>No compatible hardware encoder detected</option>';
};

const renderProcessingToggle = (
  section: ProcessingSection,
  enabled: boolean,
  title: string,
) => `<label class="processing-toggle"><input type="checkbox" data-processing-section="${section}"${checked(enabled)}/><span><strong>${title}</strong><small>${enabled ? 'Process this section using the controls below.' : 'Copy every source stream in this section without re-encoding.'}</small></span></label>`;

const renderMetadataEditor = (
  kind: 'video' | 'audio' | 'subtitle',
  index: number,
  metadata: EditableStreamMetadata,
  languageEnabled: boolean,
  flagsEnabled = languageEnabled,
) => `<div class="stream-metadata-editor ${languageEnabled || flagsEnabled ? '' : 'disabled'}"><label>Language<select data-metadata-language data-stream-kind="${kind}" data-stream-index="${index}"${languageEnabled ? '' : ' disabled'}>${mediaLanguageOptions(metadata.language).map(([code, label]) => `<option value="${code}"${selected(code === metadata.language)}>${escapeHtml(label)} (${code})</option>`).join('')}</select></label>${renderDispositionControls(kind, index, metadata.flags, !flagsEnabled, false, true)}</div>`;

const renderAdvancedToggle = (
  field: AdvancedVideoField,
  title: string,
  help: string,
  value: boolean,
) => `<button type="button" class="toggle-row advanced-toggle" role="switch" data-advanced-toggle="${field}"${switchState(value)}><span><strong>${title}</strong><small>${help}</small></span><i aria-hidden="true"></i></button>`;

const renderAdvancedRange = (
  field: 'rcLookahead' | 'spatialAq',
  title: string,
  help: string,
  value: number,
  maximum: number,
) => `<label class="advanced-range"><span><strong>${title}</strong><small>${help}</small></span><span class="advanced-range-inputs"><input type="range" min="0" max="${maximum}" value="${value}" data-advanced-range="${field}"/><input type="number" min="0" max="${maximum}" value="${value}" data-advanced-number="${field}" aria-label="${title}"/></span></label>`;

const renderAdvancedVideoPanel = (settings: JobSettings) => {
  const supported = new Set(supportedAdvancedVideoFields(settings.encoder));
  if (!supported.size) return '';
  const advanced = settings.advancedVideo;
  const controls: string[] = [];
  if (supported.has('bFrames')) controls.push(renderAdvancedToggle('bFrames', 'B-frames', settings.encoder === 'hevc_nvenc' ? 'Use five B-frames; disabling sets the count to zero.' : 'Use four B-frames; disabling sets the count to zero.', advanced.bFrames));
  if (supported.has('multipass')) controls.push(`<label class="advanced-select"><span><strong>Multipass</strong><small>Choose the encoder analysis pass.</small></span><select data-advanced-select="multipass"><option value="0"${selected(advanced.multipass === 0)}>None</option><option value="1"${selected(advanced.multipass === 1)}>Quarter resolution</option><option value="2"${selected(advanced.multipass === 2)}>Full resolution</option></select></label>`);
  if (supported.has('bRefMode')) {
    const eachAvailable = settings.encoder.endsWith('_nvenc') || settings.encoder === 'libx264';
    controls.push(`<label class="advanced-select"><span><strong>B-frame references</strong><small>Reference structure supported by this encoder.</small></span><select data-advanced-select="bRefMode"><option value="disabled"${selected(advanced.bRefMode === 'disabled')}>Disabled</option>${eachAvailable ? `<option value="each"${selected(advanced.bRefMode === 'each')}>Each</option>` : ''}<option value="middle"${selected(advanced.bRefMode !== 'disabled' && (!eachAvailable || advanced.bRefMode === 'middle'))}>Middle</option></select></label>`);
  }
  if (supported.has('adaptiveBFrames')) controls.push(renderAdvancedToggle('adaptiveBFrames', 'Adaptive B-frames', 'Allow adaptive B-frame placement.', advanced.adaptiveBFrames));
  if (supported.has('sceneCutDetection')) controls.push(renderAdvancedToggle('sceneCutDetection', 'Scene-cut detection', 'Allow automatic I-frames at scene changes.', advanced.sceneCutDetection));
  if (supported.has('rcLookahead')) controls.push(renderAdvancedRange('rcLookahead', 'RC lookahead', '0 disables lookahead; maximum 42 frames.', advanced.rcLookahead, 42));
  if (supported.has('nonReferenceP')) controls.push(renderAdvancedToggle('nonReferenceP', 'Non-reference P', 'Allow automatic non-reference P-frames.', advanced.nonReferenceP));
  if (supported.has('spatialAq')) controls.push(renderAdvancedRange('spatialAq', 'Spatial AQ', '0 disables spatial AQ; maximum strength 15.', advanced.spatialAq, 15));
  if (supported.has('temporalAq')) controls.push(renderAdvancedToggle('temporalAq', 'Temporal AQ', 'Enable temporal adaptive quantization.', advanced.temporalAq));
  return `<section class="settings-card advanced-video-panel"><div class="card-title"><div><span>ADVANCED ENCODER SETTINGS</span><h3>${encoderBackendLabel(settings.encoder)}</h3></div><span class="quality-badge">EDITABLE</span></div><p>Only options supported by the selected encoder are shown. Preset defaults come from presets.ini.</p><div class="advanced-video-grid">${controls.join('')}</div></section>`;
};

const renderVideoSettings = (source: SourceFile, settings: JobSettings) => {
  const delivery = isDeliveryPreset(settings);
  const fixedPreset = builtInPreset(settings.preset);
  const bitrateControl = fixedPreset?.bitrateControl ?? true;
  const bufferEditable = settings.preset === 'Regular' || !fixedPreset;
  const mode = qualityLabel(settings.encoder);
  const metadataOnly = isMetadataOnly(settings);
  const processing = settings.processing.video;
  const speedSupported = supportsEncoderSpeed(settings.encoder);
  const tuneOptions = encoderTuneOptions(settings.encoder);
  const configuredFrameRate = settings.frameRate;
  const frameRateState = frameRateOverrideState(source.media?.video?.frameRate, configuredFrameRate);
  const frameRateLabel = configuredFrameRate === 'passthrough'
    ? 'This preset preserves the source frame rate.'
    : frameRateState.disabled
      ? `Source ${source.media?.video?.frameRate ?? 'rate'} is below the ${configuredFrameRate} fps target.`
      : frameRateState.enabled
        ? `Output ${configuredFrameRate} fps instead of source ${source.media?.video?.frameRate ?? 'rate'}.`
        : `Source ${source.media?.video?.frameRate ?? 'rate'} already matches the ${configuredFrameRate} fps target.`;
  const encoderControls = speedSupported || tuneOptions.length
    ? `<div class="encoder-controls">${speedSupported ? `<div class="quality-control encoder-speed-control"><div><label for="encoder-speed">Encoding speed</label><span>Encoder-specific mapping: ${escapeHtml(encoderSpeedLabel(settings.encoder, settings.encoderSpeed))}</span></div><output id="encoder-speed-value">${escapeHtml(encoderSpeedDisplay(settings.encoder, settings.encoderSpeed))}</output><input id="encoder-speed" type="range" min="1" max="7" step="1" value="${settings.encoderSpeed}"/><div class="range-labels"><span>P1 Fast</span><span>P7 Ultra slow</span></div></div>` : ''}${tuneOptions.length ? `<label class="encoder-tune-control">Tune<select id="encoder-tune">${tuneOptions.map((option) => `<option value="${option.value}"${selected(option.value === settings.encoderTune)}>${escapeHtml(option.label)}</option>`).join('')}</select><small class="field-help">Options are limited to the selected encoder.</small></label>` : ''}</div>`
    : '';
  const formatTip = delivery ? '<span class="field-tooltip" title="MP4 is recommended for direct web playback and avoids a later remux.">i</span>' : '';
  return `<div class="settings-layout video-settings-layout">${renderProcessingToggle('video', processing, 'Encode video streams')}<fieldset class="settings-card processing-fieldset ${processing ? '' : 'processing-disabled'}"${processing ? '' : ' disabled'}><div class="card-title"><div><span>OUTPUT SETTINGS</span><h3>Container & dimensions</h3></div><span class="quality-badge">${escapeHtml(settings.preset.toUpperCase())}</span></div>
    <div class="form-grid"><label><span class="label-row">Format ${formatTip}</span><select id="format"><option value="mp4"${selected(settings.format === 'mp4')}>MP4</option><option value="mkv"${selected(settings.format === 'mkv')}>MKV</option><option value="webm"${selected(settings.format === 'webm')}>WebM</option></select>${delivery ? '<small class="field-help">MP4 recommended for direct web playback; other formats may require remuxing.</small>' : ''}</label>
    <label>Scale<select disabled><option>${settings.filters.scale === 'disabled' ? 'Disabled' : settings.filters.scale === 'auto' ? 'Auto Scale' : settings.filters.scale}</option></select><small class="field-help">Configure scaling in the Filters tab.</small></label>
    <label>Video encoder<select id="encoder"${appSettings.hardwareAcceleration && hardwareCapabilities.encoders.length ? '' : ' disabled'}>${encoderOptions(settings)}</select><small class="field-help">${!appSettings.hardwareAcceleration ? 'CPU software encode and decode are active.' : hardwareCapabilities.encoders.length ? `${hardwareCapabilities.adapters.join(', ') || 'Hardware'} · ${hardwareAccelerationSummary()}` : 'No hardware encoder passed the device test.'}</small></label>
    <label>Source duration<select disabled><option>${formatDuration(source.media?.duration ?? null)}</option></select></label></div>
    <button type="button" class="toggle-row ${frameRateState.disabled ? 'disabled' : ''}" role="switch" data-frame-rate-override${switchState(settings.frameRateOverride)}${frameRateState.disabled ? ' disabled' : ''}><span><strong>Frame rate override</strong><small>${escapeHtml(frameRateLabel)} Off is passthrough.</small></span><i aria-hidden="true"></i></button>${encoderControls}
    <div class="quality-control"><div><label for="quality">Constant quality</label><span>Lower values produce higher quality</span></div><output id="quality-value">${mode} ${settings.quality}</output><input id="quality" type="range" min="12" max="38" value="${settings.quality}"/><div class="range-labels"><span>Higher quality</span><span>Smaller file</span></div></div>
    <div class="video-bitrate-control ${bitrateControl ? '' : 'disabled'}"><div class="bitrate-heading"><div><strong>Bitrate control</strong><small>${bitrateControl ? 'Bitrate 0 uses variable bitrate with a quality target.' : 'Disabled by this preset in presets.ini.'}</small></div></div><div class="form-grid three-fields">
      <label>Bitrate (kbps)<input type="number" min="0" step="100" data-video-rate="videoBitrate" value="${settings.videoBitrate}"${bitrateControl ? '' : ' disabled'}/><small class="field-help">0 = VBR</small></label>
      <label>Max Rate (kbps)<input type="number" min="0" step="100" data-video-rate="maxRate" value="${settings.maxRate}"${bitrateControl ? '' : ' disabled'}/></label>
      <label>Buffer size (kbps)<input type="number" min="0" step="100" data-video-rate="bufferSize" value="${settings.bufferSize}"${bitrateControl && bufferEditable ? '' : ' disabled'}/><small class="field-help">${!bitrateControl ? 'Disabled by preset' : bufferEditable ? 'Editable for Regular and Custom presets' : `${settings.bufferMultiplier}× Max Rate, calculated automatically`}</small></label>
    </div></div></fieldset><section class="settings-card metadata-card"><div class="card-title"><div><span>VIDEO METADATA</span><h3>Language and dispositions</h3></div><span class="read-only-badge">${metadataOnly ? 'EDITING' : 'METADATA MODE ONLY'}</span></div>${renderMetadataEditor('video', 0, settings.videoMetadata, metadataOnly)}</section><div class="${processing ? '' : 'processing-disabled'}">${renderAdvancedVideoPanel(settings)}</div>
    <section class="command-card"><div class="command-heading"><div><span>COMMAND PREVIEW</span><strong>Metadata cleaned</strong></div><button id="copy-command">${icon('copy', 15)} Copy command</button></div><code id="command-preview">${escapeHtml(getCommand())}</code></section></div>`;
};

const bitrateOptions = (codec: AudioCodec, bitrate: string) => (codec === 'libopus' ? OPUS_BITRATES : AAC_BITRATES)
  .map((rate) => `<option value="${rate}"${selected(rate === bitrate)}>${rate.replace('k', ' kbps')}</option>`).join('');
const renderDispositionControls = (
  kind: 'video' | 'audio' | 'subtitle',
  index: number,
  flags: StreamFlags,
  disabled = false,
  replaceAudio = false,
  metadata = false,
) => `<div class="flag-controls"><span>${metadata ? 'METADATA FLAGS' : 'OUTPUT FLAGS'}</span>${(metadata || kind !== 'audio' ? ['default', 'forced', 'hearingImpaired'] as const : ['default', 'forced'] as const).map((flag) => {
  const locked = disabled || replaceAudio;
  const label = flag === 'hearingImpaired' ? 'Hearing impaired' : flag[0].toUpperCase() + flag.slice(1);
  const value = replaceAudio ? false : flags[flag];
  return `<label><input type="checkbox" data-stream-kind="${kind}" data-stream-index="${index}" ${metadata ? 'data-metadata-flag' : 'data-stream-flag'}="${flag}"${checked(value)}${locked ? ' disabled' : ''}/> ${label}</label>`;
}).join('')}</div>`;
const renderAudioSettings = (source: SourceFile, settings: JobSettings) => {
  const tracks = orderByFlags(source.media?.audio ?? [], (track) => settings.audio[track.index]?.flags ?? track.flags);
  if (!tracks.length) return `<div class="track-stack">${renderProcessingToggle('audio', settings.processing.audio, 'Encode selected audio streams')}<section class="empty-panel"><div class="empty-panel-icon">♪</div><h3>No audio tracks detected</h3></section></div>`;
  if (isAudioWorkflow(source)) {
    const track = tracks[0];
    const setting = settings.audio[track.index];
    const passthrough = isAudioPassthrough(settings);
    const codecOptions = `<option value="libfdk_aac"${selected(setting.codec === 'libfdk_aac')}>AAC (libfdk_aac)</option><option value="libopus"${selected(setting.codec === 'libopus')}>Opus</option><option value="copy"${selected(setting.codec === 'copy')}>Passthrough</option>`;
    return `<div class="track-stack"><section class="track-card ${passthrough ? 'track-disabled' : ''}"><div class="track-heading"><div><span>AUDIO OUTPUT</span><h3>${escapeHtml(track.codecLabel)}</h3></div><span class="track-badge">${escapeHtml(track.channelLayout)}</span></div><div class="track-meta"><span>${track.channels} channel${track.channels === 1 ? '' : 's'}</span><span>${track.sampleRate ? `${track.sampleRate / 1000} kHz` : 'Unknown sample rate'}</span><span>${track.isLossless ? 'Lossless source' : 'Lossy source'}</span></div><fieldset class="processing-fieldset"${passthrough ? ' disabled' : ''}><div class="form-grid"><label>Output codec<select data-audio-codec="${track.index}">${codecOptions}</select></label><label>Bitrate<select data-audio-bitrate="${track.index}">${bitrateOptions(setting.codec, setting.bitrate)}</select></label></div>${!track.isStereo && settings.filters.downmixToStereo ? `<div class="downmix-notice">${icon('audio', 16)} ${escapeHtml(track.channelLayout)} will be downmixed to stereo${track.channels > 2 && settings.filters.dynamicRangeCompression ? ' and dynamically compressed' : ''}.</div>` : ''}</fieldset>${renderMetadataEditor('audio', track.index, setting.metadata, !passthrough, false)}</section><section class="command-card"><div class="command-heading"><div><span>COMMAND PREVIEW</span><strong>${passthrough ? 'No conversion' : 'Audio workflow'}</strong></div><button id="copy-command">${icon('copy', 15)} Copy command</button></div><code id="command-preview">${escapeHtml(getCommand())}</code></section></div>`;
  }
  const constrained = isDeliveryPreset(settings);
  const metadataOnly = isMetadataOnly(settings);
  const processing = settings.processing.audio;
  return `<div class="track-stack">${renderProcessingToggle('audio', processing, 'Encode selected audio streams')}<div class="track-intro"><div><span>AUDIO OUTPUT</span><h3>One setting group per source track</h3></div><p>${metadataOnly ? 'All tracks will be copied; language and disposition metadata can be changed.' : processing ? constrained ? 'Streaming and Cellular allow AAC or Opus only.' : 'Configure the selected output tracks and their languages.' : 'All source audio streams will be copied unchanged.'}</p></div>${processing && settings.filters.doNotReplaceAudio ? '<div class="downmix-notice">Surround tracks are retained. The first generated stereo downmix becomes default; existing default and forced flags are removed.</div>' : ''}${tracks.map((track, position) => renderAudioTrack(track, position, settings.audio[track.index], constrained, settings.filters.doNotReplaceAudio, processing, metadataOnly, settings.filters.dynamicRangeCompression)).join('')}</div>`;
};
const renderAudioTrack = (track: AudioStreamInfo, position: number, setting: AudioSetting, constrained: boolean, replaceAudio: boolean, processing: boolean, metadataOnly: boolean, dynamicRangeCompression: boolean) => {
  const codecOptions = `<option value="libfdk_aac"${selected(setting.codec === 'libfdk_aac')}>AAC</option><option value="libopus"${selected(setting.codec === 'libopus')}>Opus</option>${constrained ? '' : `<option value="copy"${selected(setting.codec === 'copy')}>Passthrough</option>`}`;
  return `<section class="track-card ${processing && setting.enabled || metadataOnly ? '' : 'track-disabled'}"><div class="track-heading"><div><span>TRACK ${position + 1}</span><h3>${position + 1}. Track ${position + 1}: ${escapeHtml(mediaLanguageName(setting.metadata.language))}</h3></div><span class="track-badge">${escapeHtml(track.codecLabel)}</span></div><div class="track-meta"><span>${track.channels} channel${track.channels === 1 ? '' : 's'}</span><span>${escapeHtml(track.channelLayout)}</span><span>${escapeHtml(flagsLabel(setting.flags))}</span></div>
    <fieldset class="processing-fieldset"${processing ? '' : ' disabled'}><label class="check-label"><input type="checkbox" data-audio-enabled="${track.index}"${checked(setting.enabled)}/> Include track${setting.enabled ? '' : ' (lower-quality duplicate language track excluded)'}</label>
    ${processing && setting.enabled && !track.isStereo ? `<div class="downmix-notice">${icon('audio', 16)} Source is ${escapeHtml(track.channelLayout)}; this preset will downmix the track to stereo${track.channels > 2 && dynamicRangeCompression ? ' and apply dynamic range compression' : ''}.</div>` : ''}
    <div class="form-grid"><label>Output codec<select data-audio-codec="${track.index}"${setting.enabled ? '' : ' disabled'}>${codecOptions}</select></label><label>Bitrate<select data-audio-bitrate="${track.index}"${setting.enabled && setting.codec !== 'copy' ? '' : ' disabled'}>${bitrateOptions(setting.codec, setting.bitrate)}</select><small class="field-help">${setting.codec === 'libopus' ? 'Opus: 32–128 kbps' : setting.codec === 'libfdk_aac' ? 'AAC: 128–320 kbps' : 'Copied without re-encoding'}</small></label></div>${renderDispositionControls('audio', track.index, setting.flags, !setting.enabled, replaceAudio)}</fieldset>${renderMetadataEditor('audio', track.index, setting.metadata, metadataOnly || processing && setting.enabled, metadataOnly)}</section>`;
};

const renderFilterSettings = (source: SourceFile, settings: JobSettings) => {
  if (isAudioWorkflow(source)) {
    const passthrough = isAudioPassthrough(settings);
    const hasSurround = sources.some((item) => item.media?.audio.some((track) => track.channels > 2));
    const hasLossless = sources.some((item) => item.media?.audio.some((track) => track.isLossless));
    const highFrequency = sources.some((item) => item.media?.audio.some((track) => track.isLossless && (track.sampleRate ?? 0) > 48_000));
    const normalizeReady = Boolean(runtimeState?.rsgainAvailable);
    return `<section class="settings-card"><div class="card-title"><div><span>AUDIO FILTERS</span><h3>Library processing</h3></div>${icon('sliders', 22)}</div><div class="filter-options">
      <button type="button" class="toggle-row ${passthrough ? 'disabled' : ''}" role="switch" data-audio-filter="stripMetadata"${switchState(settings.filters.stripMetadata)}${passthrough ? ' disabled' : ''}><span><strong>Strip all metadata</strong><small>${passthrough ? 'Unavailable for Passthrough.' : 'Remove source container and stream metadata.'}</small></span><i aria-hidden="true"></i></button>
      <button type="button" class="toggle-row ${hasSurround && !passthrough ? '' : 'disabled'}" role="switch" data-audio-filter="downmixToStereo"${switchState(settings.filters.downmixToStereo)}${hasSurround && !passthrough ? '' : ' disabled'}><span><strong>Downmix to stereo</strong><small>${passthrough ? 'Unavailable for Passthrough.' : hasSurround ? 'Apply the surround downmix filter to multichannel sources.' : 'No surround source was detected.'}</small></span><i aria-hidden="true"></i></button>
      <button type="button" class="toggle-row ${hasSurround && settings.filters.downmixToStereo && !passthrough ? '' : 'disabled'}" role="switch" data-audio-filter="dynamicRangeCompression"${switchState(settings.filters.dynamicRangeCompression)}${hasSurround && settings.filters.downmixToStereo && !passthrough ? '' : ' disabled'}><span><strong>Dynamic range compressor</strong><small>${passthrough ? 'Unavailable for Passthrough.' : !hasSurround ? 'No surround source was detected.' : !settings.filters.downmixToStereo ? 'Enable surround downmixing to use compression.' : 'Apply Feishin\'s Default compressor immediately after surround downmixing.'}</small></span><i aria-hidden="true"></i></button>
      <button type="button" class="toggle-row ${hasLossless && !passthrough ? '' : 'disabled'}" role="switch" data-audio-filter="resampleLosslessTo48k"${switchState(settings.filters.resampleLosslessTo48k)}${hasLossless && !passthrough ? '' : ' disabled'}><span><strong>Convert high-frequency lossless audio to 48 kHz</strong><small>${passthrough ? 'Unavailable for Passthrough.' : hasLossless ? highFrequency ? 'High-frequency lossless audio was detected.' : 'Lossless audio is already at or below 48 kHz.' : 'No ALAC, FLAC, PCM, or other lossless source was detected.'}</small></span><i aria-hidden="true"></i></button>
      <button type="button" class="toggle-row ${normalizeReady ? '' : 'disabled'}" role="switch" data-audio-filter="normalizeAudio"${switchState(settings.filters.normalizeAudio)}${normalizeReady ? '' : ' disabled'}><span><strong>Normalize Audio</strong><small>${normalizeReady ? 'Runs rsgain once after every audio encode succeeds.' : 'The managed rsgain runtime is unavailable.'}</small></span><i aria-hidden="true"></i></button>
    </div></section>`;
  }
  const video = source.media?.video;
  const isHdr = Boolean(video?.hasHdr || video?.hasDolbyVision);
  const outputCodec = preferredCodecForEncoder(settings.encoder);
  const h264Output = outputCodec === 'H.264';
  const h264High = h264Output && settings.encoderProfile.toLowerCase() === 'high';
  const hevcOutput = outputCodec === 'HEVC';
  const supports10Bit = encoderCanOutput10Bit(settings.encoder);
  const allowMain10 = hevcOutput && supports10Bit;
  const hasSurround = Boolean(source.media?.audio.some((track) => settings.audio[track.index]?.enabled && track.channels > 2));
  const crop = detectedCropForSource(source);
  const cropDetail = crop ? `Detected ${crop.filter}` : 'No crop detected; full frame will be retained';
  const musicVideoScale = isMusicVideoWorkflow(source)
    ? outputDefaultsFor(requiredBuiltInPreset('Music Video'), '4k', settings.encoder).resolution.join(':')
    : '';
  return `<div class="filter-layout"><fieldset class="settings-card processing-fieldset ${settings.processing.video ? '' : 'processing-disabled'}"${settings.processing.video ? '' : ' disabled'}><div class="card-title"><div><span>PICTURE FILTERS</span><h3>Automatic processing</h3></div>${icon('sliders', 22)}</div>
    <div class="filter-options"><button type="button" class="toggle-row" role="switch" data-filter="autoCrop"${switchState(settings.filters.autoCrop)}><span><strong>Auto Crop</strong><small>${escapeHtml(cropDetail)}</small></span><i aria-hidden="true"></i></button>
    <button type="button" class="toggle-row ${isHdr ? '' : 'disabled'}" role="switch" data-filter="toneMapHdrToSdr"${switchState(settings.filters.toneMapHdrToSdr)}${isHdr ? '' : ' disabled'}><span><strong>HDR to SDR</strong><small>${isHdr ? `Tone-map ${escapeHtml(hdrLabel(source))} to SDR` : 'Unavailable because the source is SDR'}</small></span><i aria-hidden="true"></i></button>
    <button type="button" class="toggle-row ${allowMain10 ? '' : 'disabled'}" role="switch" data-filter="pixelFormat10Bit"${switchState(settings.filters.pixelFormat10Bit && hevcOutput)}${allowMain10 ? '' : ' disabled'}><span><strong>HEVC Main10 profile</strong><small>${allowMain10 ? settings.encoder.endsWith('_nvenc') ? 'Use HEVC Main10 and CUDA-native p010le output without leaving GPU memory' : 'Use the HEVC Main10 profile and a 10-bit output pixel format' : hevcOutput ? 'The detected HEVC encoder did not pass its 10-bit capability test' : 'Available only when an HEVC output encoder is selected'}</small></span><i aria-hidden="true"></i></button>
    ${h264Output ? `<button type="button" class="toggle-row" role="switch" data-video-profile="h264-high"${switchState(h264High)}><span><strong>H.264 High profile</strong><small>Use the High output profile; enabled by default for H.264.</small></span><i aria-hidden="true"></i></button>` : ''}
    <label class="scale-row"><span><strong>Auto scale</strong><small>${isMusicVideoWorkflow(source) ? `Music Video locks Auto Scale and only scales 4K sources to ${escapeHtml(musicVideoScale)}.` : settings.filters.scaleLocked ? 'Cellular locks scaling to 360p.' : 'Choose an automatic output height or leave scaling disabled.'}</small></span><select id="filter-scale"${settings.filters.scaleLocked ? ' disabled' : ''}><option value="auto"${selected(settings.filters.scale === 'auto')}>Auto Scale</option><option value="1080p"${selected(settings.filters.scale === '1080p')}>1080p</option><option value="720p"${selected(settings.filters.scale === '720p')}>720p</option><option value="360p"${selected(settings.filters.scale === '360p')}>360p</option><option value="disabled"${selected(settings.filters.scale === 'disabled')}>Disabled</option></select></label></div></fieldset>
    <fieldset class="settings-card processing-fieldset ${settings.processing.audio ? '' : 'processing-disabled'}"${settings.processing.audio ? '' : ' disabled'}><div class="card-title"><div><span>AUDIO FILTERS</span><h3>Surround processing</h3></div>${icon('audio', 22)}</div><div class="filter-options">
      <button type="button" class="toggle-row ${hasSurround ? '' : 'disabled'}" role="switch" data-audio-filter="dynamicRangeCompression"${switchState(settings.filters.dynamicRangeCompression)}${hasSurround ? '' : ' disabled'}><span><strong>Dynamic range compressor</strong><small>${hasSurround ? 'Apply Feishin\'s Default compressor immediately after each surround downmix.' : 'No enabled surround source was detected.'}</small></span><i aria-hidden="true"></i></button>
    </div></fieldset>
    <section class="settings-card locked-options"><div class="card-title"><div><span>OUTPUT CONTENT</span><h3>Required job behavior</h3></div>${icon('check', 22)}</div><div class="job-options">
      <label class="locked-check"><input type="checkbox" checked disabled/> Remux audio into video output</label><label class="locked-check"><input type="checkbox" checked disabled/> Remux subtitles into video output</label><label class="locked-check"><input type="checkbox"${checked(settings.filters.stripMetadata)} disabled/> ${settings.filters.stripMetadata ? 'Strip title, group, and description metadata' : 'Preserve source metadata'}</label>
      <label class="locked-check ${hasSurround ? '' : 'disabled'}"><input type="checkbox" data-job-behavior="doNotReplaceAudio"${checked(settings.filters.doNotReplaceAudio)}${hasSurround ? '' : ' disabled'}/> Do not replace audio track <small>Keep surround and add a default stereo downmix.</small></label></div></section></div>`;
};

const importSubtitlesForSource = async (source: SourceFile, settings: JobSettings) => {
  if (!source.media?.video) return;
  const nextIndex = Math.max(-1, ...source.media.subtitles.map((track) => track.index)) + 1;
  const result = await window.mediaAPI.importSubtitles(source.path, nextIndex).catch(() => null);
  if (!result) {
    showToast('Unable to import subtitle files');
    return;
  }
  const existing = new Set(source.media.subtitles.flatMap((track) => track.externalPath
    ? [track.externalPath.toLocaleLowerCase()] : []));
  const imported = result.tracks.filter((track) => track.externalPath
    && !existing.has(track.externalPath.toLocaleLowerCase()));
  for (const track of imported) {
    source.media.subtitles.push(track);
    settings.subtitles[track.index] = {
      enabled: true,
      codec: settings.format === 'mp4' ? 'mov_text' : settings.format === 'webm' ? 'webvtt' : 'subrip',
      flags: { ...track.flags },
      metadata: copyMetadata(track.language, track.flags),
    };
  }
  normalizeStreamDispositions(settings);
  if (result.rejectedPaths.length) {
    showToast(`${result.rejectedPaths.length} subtitle file${result.rejectedPaths.length === 1 ? '' : 's'} rejected: UTF-8 required`);
  } else if (imported.length) {
    showToast(`Imported ${imported.length} subtitle file${imported.length === 1 ? '' : 's'}`);
  } else if (result.tracks.length) {
    showToast('Those subtitle files are already imported');
  }
  renderWorkspace();
};

const renderSubtitleSettings = (source: SourceFile, settings: JobSettings) => {
  const tracks = orderByFlags(source.media?.subtitles ?? [], (track) => settings.subtitles[track.index]?.flags ?? track.flags);
  const metadataOnly = isMetadataOnly(settings);
  const processing = settings.processing.subtitles;
  const captionExtraction = isMusicVideoWorkflow(source)
    ? `<section class="settings-card closed-caption-card"><div class="card-title"><div><span>EMBEDDED CLOSED CAPTIONS</span><h3>Automatic CEA-608 / CEA-708 extraction</h3></div><span class="track-badge text">CCExtractor ${escapeHtml(runtimeState?.ccextractorVersion?.replace(/^v/i, '') ?? '')}</span></div><p>${runtimeState?.ccextractorAvailable ? 'Music Video automatically checks for embedded captions and remuxes any extracted SRT track.' : 'CCExtractor is unavailable, so embedded captions cannot be checked.'}</p></section>`
    : '';
  const importButton = `<button class="secondary-button import-subtitles" id="import-subtitles">${icon('captions', 16)} Import UTF-8 subtitles</button>`;
  if (!tracks.length) return `<div class="track-stack">${renderProcessingToggle('subtitles', processing, 'Encode selected subtitle streams')}${captionExtraction}<section class="empty-panel"><div class="empty-panel-icon">CC</div><span>SUBTITLES</span><h3>No separate subtitle tracks detected</h3><p>${isMusicVideoWorkflow(source) ? 'Embedded captions are checked automatically. You can also import UTF-8 subtitle files.' : 'No subtitle streams were reported by FFprobe. Import SRT, ASS, SSA, or WebVTT files here.'}</p>${importButton}</section></div>`;
  return `<div class="track-stack">${renderProcessingToggle('subtitles', processing, 'Encode selected subtitle streams')}${captionExtraction}<div class="track-intro"><div><span>SUBTITLE OUTPUT</span><h3>${tracks.length} detected track${tracks.length === 1 ? '' : 's'}</h3></div><div class="track-guidance"><p>${metadataOnly ? 'Embedded tracks are copied and imported UTF-8 files are added during source replacement.' : processing ? settings.format === 'mp4' ? 'MP4 converts text subtitles to mov_text.' : 'Text subtitles can be converted to SRT or WebVTT.' : 'Enable subtitle processing to include imported files.'}</p>${importButton}</div></div>${tracks.map((track, position) => renderSubtitleTrack(track, position, settings, processing, metadataOnly)).join('')}</div>`;
};
const renderSubtitleTrack = (track: SubtitleStreamInfo, position: number, settings: JobSettings, processing: boolean, metadataOnly: boolean) => {
  const setting = settings.subtitles[track.index], mp4 = settings.format === 'mp4', imageBlocked = track.kind === 'image' && mp4;
  const options = track.kind === 'image'
    ? '<option value="copy">Preserve image subtitle</option>'
    : mp4
      ? '<option value="mov_text">MOV text (required by MP4)</option>'
      : `<option value="subrip"${selected(setting.codec === 'subrip')}>SRT (SubRip)</option><option value="webvtt"${selected(setting.codec === 'webvtt')}>WebVTT</option>`;
  return `<section class="track-card ${processing && !imageBlocked || metadataOnly ? '' : 'track-disabled'}"><div class="track-heading"><div><span>TRACK ${position + 1}</span><h3>${position + 1}. Track ${position + 1}: ${escapeHtml(mediaLanguageName(setting.metadata.language))}</h3></div><span class="track-badge ${track.kind}">${escapeHtml(track.codecLabel)}</span></div>
    <div class="track-meta"><span>${track.kind === 'text' ? 'Text-based' : 'Image-based'}</span><span>${track.isUtf8 ? 'UTF-8' : 'Binary image'}</span><span>${escapeHtml(flagsLabel(setting.flags))}</span></div>${processing && imageBlocked ? '<div class="downmix-notice warning">Image subtitles cannot be converted to mov_text and will be excluded from MP4.</div>' : ''}
    <fieldset class="processing-fieldset"${processing ? '' : ' disabled'}><div class="subtitle-controls"><label class="check-label"><input type="checkbox" data-subtitle-enabled="${track.index}"${checked(setting.enabled && !imageBlocked)}${imageBlocked ? ' disabled' : ''}/> Include track</label><label>Output format<select data-subtitle-codec="${track.index}"${mp4 || track.kind === 'image' ? ' disabled' : ''}>${options}</select></label></div>${renderDispositionControls('subtitle', track.index, setting.flags, imageBlocked || !setting.enabled)}</fieldset>${renderMetadataEditor('subtitle', track.index, setting.metadata, metadataOnly || processing && setting.enabled && !imageBlocked, metadataOnly)}</section>`;
};

const updateCommand = () => {
  const preview = document.querySelector<HTMLElement>('#command-preview');
  if (preview) preview.textContent = getCommand();
  const quality = document.querySelector<HTMLInputElement>('#quality'), value = document.querySelector<HTMLOutputElement>('#quality-value');
  if (quality && value) value.textContent = `${qualityLabel(getSettings(sources[selectedIndex]).encoder)} ${quality.value}`;
};
const bindContentEvents = () => {
  const source = sources[selectedIndex];
  if (!source) return;
  const settings = getSettings(source);
  document.querySelectorAll<HTMLInputElement>('[data-processing-section]').forEach((control) => control.addEventListener('change', () => {
    const section = control.dataset.processingSection as ProcessingSection;
    sources.forEach((item) => { getSettings(item).processing[section] = control.checked; });
    renderWorkspace();
  }));
  document.querySelector<HTMLInputElement>('#quality')?.addEventListener('input', (event) => { settings.quality = (event.currentTarget as HTMLInputElement).value; markCustom(settings); updateCommand(); });
  document.querySelector<HTMLButtonElement>('[data-frame-rate-override]')?.addEventListener('click', (event) => {
    settings.frameRateOverride = toggleSwitch(event.currentTarget as HTMLButtonElement);
    updateCommand();
  });
  document.querySelector<HTMLInputElement>('#encoder-speed')?.addEventListener('input', (event) => {
    settings.encoderSpeed = normalizeEncoderSpeed(Number((event.currentTarget as HTMLInputElement).value));
    const value = document.querySelector<HTMLOutputElement>('#encoder-speed-value');
    if (value) value.textContent = encoderSpeedDisplay(settings.encoder, settings.encoderSpeed);
    markCustom(settings);
    updateCommand();
  });
  document.querySelector<HTMLSelectElement>('#encoder-tune')?.addEventListener('input', (event) => {
    settings.encoderTune = normalizeEncoderTune(settings.encoder, (event.currentTarget as HTMLSelectElement).value);
    markCustom(settings);
    updateCommand();
  });
  document.querySelectorAll<HTMLButtonElement>('[data-advanced-toggle]').forEach((control) => control.addEventListener('click', () => {
    const field = control.dataset.advancedToggle as keyof Pick<AdvancedVideoSettings, 'bFrames' | 'adaptiveBFrames' | 'sceneCutDetection' | 'nonReferenceP' | 'temporalAq'>;
    settings.advancedVideo[field] = toggleSwitch(control);
    markCustom(settings);
    updateCommand();
  }));
  document.querySelectorAll<HTMLSelectElement>('[data-advanced-select]').forEach((control) => control.addEventListener('input', () => {
    if (control.dataset.advancedSelect === 'multipass') {
      settings.advancedVideo.multipass = Number(control.value) as AdvancedVideoSettings['multipass'];
    } else {
      settings.advancedVideo.bRefMode = control.value as AdvancedVideoSettings['bRefMode'];
    }
    markCustom(settings);
    updateCommand();
  }));
  const updateAdvancedNumber = (control: HTMLInputElement) => {
    const field = (control.dataset.advancedRange ?? control.dataset.advancedNumber) as 'rcLookahead' | 'spatialAq';
    const maximum = field === 'rcLookahead' ? 42 : 15;
    const value = Math.min(maximum, Math.max(0, Math.round(Number(control.value) || 0)));
    settings.advancedVideo[field] = value;
    document.querySelectorAll<HTMLInputElement>(`[data-advanced-range="${field}"], [data-advanced-number="${field}"]`)
      .forEach((peer) => { if (peer !== control) peer.value = String(value); });
    markCustom(settings);
    updateCommand();
  };
  document.querySelectorAll<HTMLInputElement>('[data-advanced-range], [data-advanced-number]').forEach((control) => {
    control.addEventListener('input', () => updateAdvancedNumber(control));
    control.addEventListener('change', () => { control.value = String(settings.advancedVideo[(control.dataset.advancedRange ?? control.dataset.advancedNumber) as 'rcLookahead' | 'spatialAq']); });
  });
  const updateVideoRate = (control: HTMLInputElement) => {
    const field = control.dataset.videoRate as 'videoBitrate' | 'maxRate' | 'bufferSize';
    settings[field] = String(Math.max(0, Number(control.value) || 0));
    if (field === 'maxRate') {
      settings.bufferSize = String(bufferSizeFor(Number(settings.maxRate), settings.bufferMultiplier));
      const buffer = document.querySelector<HTMLInputElement>('[data-video-rate="bufferSize"]');
      if (buffer) buffer.value = settings.bufferSize;
    }
  };
  document.querySelectorAll<HTMLInputElement>('[data-video-rate]').forEach((control) => {
    control.addEventListener('input', () => {
      updateVideoRate(control);
      updateCommand();
    });
    control.addEventListener('change', () => {
      updateVideoRate(control);
      markCustom(settings);
      renderWorkspace();
    });
  });
  (['format', 'encoder'] as const).forEach((field) => document.querySelector<HTMLSelectElement>(`#${field}`)?.addEventListener('change', (event) => {
    const value = (event.currentTarget as HTMLSelectElement).value;
    if (field === 'format') {
      settings.format = value as JobSettings['format'];
      for (const track of source.media?.subtitles ?? []) {
        const subtitle = settings.subtitles[track.index];
        if (settings.format === 'mp4') { subtitle.enabled = track.kind === 'text' && subtitle.enabled; subtitle.codec = track.kind === 'text' ? 'mov_text' : 'copy'; }
        else if (settings.format === 'webm') { subtitle.enabled = track.kind === 'text' && subtitle.enabled; subtitle.codec = track.kind === 'text' ? 'webvtt' : 'copy'; }
        else if (track.kind === 'text' && (subtitle.codec === 'mov_text' || subtitle.codec === 'webvtt')) subtitle.codec = 'subrip';
      }
      markCustom(settings);
      renderWorkspace();
    } else {
      const defaults = builtInPreset(settings.preset);
      settings[field] = value;
      settings.encoderTune = normalizeEncoderTune(value, defaults ? presetTune(defaults, value) : settings.encoderTune);
      if (defaults) {
        const outputProfile = outputProfileFor(source, settings.filters.scale, defaults.name);
        const outputDefaults = outputDefaultsFor(defaults, outputProfile.tier, value);
        settings.encoderSpeed = normalizeEncoderSpeed(outputDefaults.encoderSpeed);
        settings.encoderProfile = outputDefaults.encoderProfile;
        settings.quality = outputDefaults.quality;
        settings.videoBitrate = String(defaults.bitrateControl ? outputDefaults.videoBitrate : 0);
        settings.maxRate = String(defaults.bitrateControl ? outputDefaults.maxRate : 0);
        settings.bufferSize = String(bufferSizeFor(defaults.bitrateControl ? outputDefaults.maxRate : 0, defaults.bufferMultiplier));
        settings.advancedVideo = resolvePresetAdvancedVideo(
          outputDefaults.deliveryPreset,
          preferredCodecForEncoder(value),
          outputProfile.tier,
        );
      } else {
        settings.encoderProfile = preferredCodecForEncoder(value) === 'H.264' ? 'high' : '';
      }
      markCustom(settings);
      renderWorkspace();
    }
  }));
  document.querySelector('#copy-command')?.addEventListener('click', async () => { await navigator.clipboard.writeText(getCommand()); showToast('FFmpeg command copied'); });
  document.querySelectorAll<HTMLSelectElement>('[data-audio-codec]').forEach((control) => control.addEventListener('change', () => {
    const index = Number(control.dataset.audioCodec), codec = control.value as AudioCodec, current = settings.audio[index];
    const track = source.media?.audio.find((item) => item.index === index);
    current.codec = codec;
    if (isAudioWorkflow(source)) {
      settings.format = codec === 'libopus' ? 'opus' : codec === 'libfdk_aac' ? 'm4a' : 'source';
      if (codec === 'copy') appSettings.separateAudioDirectory = false;
    }
    current.bitrate = isAudioWorkflow(source) && track && codec !== 'copy'
      ? audioBitrate(codec === 'libopus' ? 'Streaming' : 'Archive', track, settings.filters.downmixToStereo)
      : audioBitrateFor(
      settings.preset, codec, track?.isStereo ?? true,
      codec === 'libopus' ? (track?.isStereo === false ? '128k' : '96k') : (track?.isStereo === false ? '160k' : '144k'),
      );
    markCustom(settings);
    renderWorkspace();
  }));
  document.querySelectorAll<HTMLInputElement>('[data-audio-enabled]').forEach((control) => control.addEventListener('change', () => {
    const index = Number(control.dataset.audioEnabled);
    const track = source.media?.audio.find((item) => item.index === index);
    const setting = settings.audio[index];
    setting.enabled = control.checked;
    if (!control.checked) setting.flags = { default: false, forced: false, hearingImpaired: false };
    if (control.checked && track && track.language !== 'und') {
      for (const other of source.media?.audio ?? []) {
        if (other.index === index || other.language !== track.language) continue;
        settings.audio[other.index].enabled = false;
        settings.audio[other.index].flags = { default: false, forced: false, hearingImpaired: false };
      }
    }
    consolidatePrimaryDispositions(settings.audio);
    markCustom(settings);
    renderWorkspace();
  }));
  document.querySelectorAll<HTMLSelectElement>('[data-audio-bitrate]').forEach((control) => control.addEventListener('change', () => { settings.audio[Number(control.dataset.audioBitrate)].bitrate = control.value; markCustom(settings); updateCommand(); }));
  document.querySelectorAll<HTMLInputElement>('[data-subtitle-enabled]').forEach((control) => control.addEventListener('change', () => {
    const setting = settings.subtitles[Number(control.dataset.subtitleEnabled)];
    setting.enabled = control.checked;
    if (!control.checked) {
      setting.flags.default = false;
      setting.flags.forced = false;
    }
    consolidatePrimaryDispositions(settings.subtitles);
    markCustom(settings);
    renderWorkspace();
  }));
  document.querySelector<HTMLButtonElement>('#import-subtitles')?.addEventListener('click', () =>
    void importSubtitlesForSource(source, settings));
  document.querySelector<HTMLInputElement>('[data-extract-closed-captions]')?.addEventListener('change', (event) => {
    settings.filters.extractClosedCaptions = (event.currentTarget as HTMLInputElement).checked;
    markCustom(settings);
    renderWorkspace();
  });
  document.querySelectorAll<HTMLSelectElement>('[data-subtitle-codec]').forEach((control) => control.addEventListener('change', () => { settings.subtitles[Number(control.dataset.subtitleCodec)].codec = control.value as SubtitleCodec; markCustom(settings); updateCommand(); }));
  document.querySelectorAll<HTMLInputElement>('[data-stream-flag]').forEach((control) => control.addEventListener('change', () => {
    const kind = control.dataset.streamKind as 'audio' | 'subtitle';
    const index = Number(control.dataset.streamIndex);
    const flag = control.dataset.streamFlag as keyof StreamFlags;
    const record = kind === 'audio' ? settings.audio : settings.subtitles;
    setPrimaryDisposition(record, index, flag, control.checked);
    markCustom(settings);
    renderWorkspace();
  }));
  document.querySelectorAll<HTMLSelectElement>('[data-metadata-language]').forEach((control) => control.addEventListener('change', () => {
    const kind = control.dataset.streamKind as 'video' | 'audio' | 'subtitle';
    const index = Number(control.dataset.streamIndex);
    const metadata = kind === 'video'
      ? settings.videoMetadata
      : kind === 'audio'
        ? settings.audio[index].metadata
        : settings.subtitles[index].metadata;
    metadata.language = control.value;
    renderWorkspace();
  }));
  document.querySelectorAll<HTMLInputElement>('[data-metadata-flag]').forEach((control) => control.addEventListener('change', () => {
    const kind = control.dataset.streamKind as 'video' | 'audio' | 'subtitle';
    const index = Number(control.dataset.streamIndex);
    const flag = control.dataset.metadataFlag as keyof StreamFlags;
    const metadata = kind === 'video'
      ? settings.videoMetadata
      : kind === 'audio'
        ? settings.audio[index].metadata
        : settings.subtitles[index].metadata;
    if (kind === 'video') metadata.flags[flag] = control.checked;
    else {
      const record = kind === 'audio' ? settings.audio : settings.subtitles;
      setPrimaryDisposition(metadataDispositionRecord(record), index, flag, control.checked);
    }
    renderWorkspace();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-filter]').forEach((control) => control.addEventListener('click', () => {
    const key = control.dataset.filter as 'autoCrop' | 'toneMapHdrToSdr' | 'pixelFormat10Bit';
    settings.filters[key] = toggleSwitch(control);
    markCustom(settings);
    renderWorkspace();
  }));
  document.querySelectorAll<HTMLButtonElement>('[data-audio-filter]').forEach((control) => control.addEventListener('click', () => {
    const key = control.dataset.audioFilter as 'stripMetadata' | 'downmixToStereo' | 'dynamicRangeCompression' | 'resampleLosslessTo48k' | 'normalizeAudio';
    settings.filters[key] = toggleSwitch(control);
    if (key === 'downmixToStereo') {
      for (const track of source.media?.audio ?? []) {
        const audio = settings.audio[track.index];
        if (!audio || audio.codec === 'copy') continue;
        audio.bitrate = audioBitrate(audio.codec === 'libopus' ? 'Streaming' : 'Archive', track, settings.filters.downmixToStereo);
      }
    }
    markCustom(settings);
    renderWorkspace();
  }));
  document.querySelector<HTMLButtonElement>('[data-video-profile="h264-high"]')?.addEventListener('click', (event) => {
    settings.encoderProfile = toggleSwitch(event.currentTarget as HTMLButtonElement) ? 'high' : '';
    markCustom(settings);
    renderWorkspace();
  });
  document.querySelector<HTMLSelectElement>('#filter-scale')?.addEventListener('change', (event) => {
    const scale = (event.currentTarget as HTMLSelectElement).value as ScaleMode;
    if (builtInPreset(settings.preset)) {
      for (const item of sources) applyBuiltInScaleProfile(item, getSettings(item), scale);
      void persistAppSettings();
    } else {
      settings.filters.scale = scale;
      markCustom(settings);
    }
    renderWorkspace();
  });
  document.querySelector<HTMLInputElement>('[data-job-behavior="doNotReplaceAudio"]')?.addEventListener('change', (event) => {
    settings.filters.doNotReplaceAudio = (event.currentTarget as HTMLInputElement).checked;
    if (settings.filters.doNotReplaceAudio) {
      Object.values(settings.audio).forEach((audio) => {
        audio.flags.default = false;
        audio.flags.forced = false;
      });
    }
    markCustom(settings);
    renderWorkspace();
  });
};
const saveCurrentPreset = async (source: SourceFile) => {
  const settings = getSettings(source);
  const name = document.querySelector<HTMLInputElement>('#custom-preset-name')?.value.trim() ?? '';
  if (!name) {
    showToast('Enter a name for the custom preset');
    return;
  }
  if (!isValidCustomPresetName(name)) {
    showToast('Preset names cannot contain ], carriage returns, or line breaks');
    return;
  }
  const predefinedNames = builtInPresetConfiguration
    ? Object.keys(builtInPresetConfiguration.presets)
    : [...REQUIRED_BUILT_IN_PRESET_NAMES];
  if ([...predefinedNames, ...AUDIO_PRESET_NAMES, 'Custom'].includes(name)) {
    showToast('Choose a name different from the built-in presets');
    return;
  }
  const preset = snapshotPreset(settings, name);
  appSettings.customPresets = [...appSettings.customPresets.filter((item) => item.name !== name), preset];
  appSettings.lastPreset = name;
  for (const item of sources) getSettings(item).preset = name;
  customPresetDraftName = '';
  try {
    await window.mediaAPI.saveCustomPresets(appSettings.customPresets);
    await window.mediaAPI.saveSettings(appSettings);
    showToast(`Saved preset: ${name}`);
    renderWorkspace();
  } catch (error) {
    showToast(error instanceof Error ? error.message : 'Unable to save custom_preset.ini');
  }
};
const bindWorkspaceEvents = () => {
  const source = sources[selectedIndex];
  if (!source) return;
  document.querySelector('#add-more-videos')?.addEventListener('click', () => void addSources());
  document.querySelector<HTMLSelectElement>('#preset')?.addEventListener('change', (event) => {
    const preset = (event.currentTarget as HTMLSelectElement).value;
    sources.forEach((item) => applyPreset(item, preset, false));
    appSettings.lastPreset = preset;
    void persistAppSettings();
    renderWorkspace();
  });
  document.querySelector<HTMLInputElement>('#custom-preset-name')?.addEventListener('input', (event) => {
    customPresetDraftName = (event.currentTarget as HTMLInputElement).value;
  });
  document.querySelector('#save-preset')?.addEventListener('click', () => void saveCurrentPreset(source));
  document.querySelectorAll<HTMLElement>('[data-source-index]').forEach((row) => row.addEventListener('click', () => {
    selectedIndex = Number(row.dataset.sourceIndex);
    if (!outputDirectoryIsCustom) outputDirectory = makeDefaultOutputDirectory(sources[selectedIndex]);
    renderWorkspace();
  }));
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((tab) => tab.addEventListener('click', () => { activeTab = tab.dataset.tab || 'Summary'; renderWorkspace(); }));
  document.querySelector('#browse-output')?.addEventListener('click', async () => {
    const selectedPath = await window.mediaAPI.chooseOutputDirectory(outputDirectoryFor(source));
    if (selectedPath) { outputDirectory = selectedPath; outputDirectoryIsCustom = true; renderWorkspace(); }
  });
  document.querySelector<HTMLInputElement>('#smart-file-naming')?.addEventListener('change', (event) => {
    appSettings.smartFileNaming = (event.currentTarget as HTMLInputElement).checked;
    void persistAppSettings();
    renderWorkspace();
  });
  document.querySelector<HTMLInputElement>('#separate-audio-directory')?.addEventListener('change', (event) => {
    appSettings.separateAudioDirectory = (event.currentTarget as HTMLInputElement).checked;
    outputDirectoryIsCustom = false;
    outputDirectory = makeDefaultOutputDirectory(source);
    void persistAppSettings();
    renderWorkspace();
  });
  document.querySelector('#apply-metadata-all')?.addEventListener('click', () => {
    const updated = applyMetadataChangesToQueue(source);
    showToast(updated
      ? `Applied metadata changes to ${updated} queued source${updated === 1 ? '' : 's'}`
      : 'No matching queued streams needed changes');
    renderWorkspace();
  });
  document.querySelector('#start-encode')?.addEventListener('click', () => void startEncoding());
  bindWindowControls();
  bindContentEvents();
};
const addSources = async () => {
  if (sourceMode !== 'file') return;
  const newSources = await requestSources('file');
  if (!newSources.length) return;
  appSettings.lastSourceDirectory = parentPath(newSources[0].path);
  void persistAppSettings();
  const referenceSource = sources[selectedIndex] ?? null;
  const referenceSettings = referenceSource ? getSettings(referenceSource) : null;
  const known = new Set(sources.map((source) => source.path.toLowerCase()));
  const workflow = sources[0] ? workflowOf(sources[0]) : null;
  const additions = newSources.filter((source) => !known.has(source.path.toLowerCase())
    && (!workflow || workflowOf(source) === workflow));
  sources = [...sources, ...additions];
  if (referenceSource && referenceSettings) {
    additions.forEach((item) => {
      applyPreset(item, referenceSettings.preset, false);
      getSettings(item).processing = { ...referenceSettings.processing };
      if (builtInPreset(referenceSettings.preset)) {
        applyBuiltInScaleProfile(item, getSettings(item), referenceSettings.filters.scale);
      }
      syncBatchTrackSettings(referenceSource, referenceSettings, item, getSettings(item));
    });
  }
  renderWorkspace();
};
const startApplication = async () => {
  window.mediaAPI.onEncodeProgress(updateEncodeDialog);
  window.mediaAPI.onSourceScanProgress(updatePickerProgress);
  renderBootstrap();
  const removeProgressListener = window.mediaAPI.onRuntimeProgress((state) => { runtimeState = state; renderBootstrap(state); });
  try {
    await window.mediaAPI.initializeAppUpdate();
    builtInPresetConfiguration = await window.mediaAPI.loadBuiltInPresets();
    try { appSettings = await window.mediaAPI.loadSettings(); } catch { /* defaults remain active */ }
    appSettings.customPresets = await window.mediaAPI.loadCustomPresets();
    runtimeState = await window.mediaAPI.initializeRuntime(appSettings.useStableFfmpeg); renderBootstrap(runtimeState);
    if (runtimeState.ffmpegAvailable && appSettings.hardwareAcceleration) {
      renderBootstrap({ ...runtimeState, message: 'Testing GPU encoding capabilities', progress: null });
      try { hardwareCapabilities = await window.mediaAPI.detectHardware(); } catch { /* The UI will report that no hardware encoder passed. */ }
    }
    await new Promise((resolve) => window.setTimeout(resolve, runtimeState?.phase === 'error' ? 900 : 350));
  } catch (error) {
    runtimeState = { phase: 'error', message: error instanceof Error ? error.message : 'Unable to initialize FFmpeg', progress: null, appVersion: '2.6.7', isPackaged: false, updateEnabled: false, ffmpegAvailable: false, ffmpegPath: '', ffprobePath: '', ffmpegVersion: null, releaseTag: null, ffmpegChannel: appSettings.useStableFfmpeg ? 'stable' : 'unstable', rsgainAvailable: false, rsgainPath: '', rsgainVersion: null, ccextractorAvailable: false, ccextractorPath: '', ccextractorVersion: null };
    renderBootstrap(runtimeState); await new Promise((resolve) => window.setTimeout(resolve, 900));
  } finally { removeProgressListener(); }
  if (!builtInPresetConfiguration) return;
  renderWelcome();
};

void startApplication();
