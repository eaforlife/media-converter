import { booleanValue, parseIniSections } from './presets.ts';
import type { VideoEncoderCapability } from './shared-types';

export const CONFIG_SOURCE_URL = 'https://raw.githubusercontent.com/eaforlife/media-converter/main/config.ini';
export const URGENT_UPDATE_SOURCE_URL = 'https://raw.githubusercontent.com/eaforlife/media-converter/main/updatepolicy';

export type AudioPresetConfig = {
  codec: 'libopus' | 'libfdk_aac' | 'copy';
  extension: string | null;
  stereoBitrate: string;
  downmixBitrate: string;
  dynamicRangeCompression: boolean;
};
export type EncoderCandidateConfig = Omit<VideoEncoderCapability, 'tenBit'> & {
  main10Enabled: boolean;
  highEnabled: boolean;
  platforms?: NodeJS.Platform[];
};
export type AppConfiguration = {
  app: {
    name: string;
    codename: string;
    updateRepository: string;
    presetSourceUrl: string;
    ffmpegReleaseApi: string;
    ffmpegReleasesApi: string;
    rsgainReleaseApi: string;
    ccextractorReleaseApi: string;
  };
  mediaExtensions: { video: readonly string[]; audio: readonly string[] };
  audioPresets: Record<'Streaming' | 'Archive' | 'Passthrough', AudioPresetConfig>;
  audioBitrates: { aac: readonly string[]; opus: readonly string[] };
  audioFilters: {
    timestampResample: string;
    downmix71: string;
    downmix51: string;
    downmixSurround: string;
    compressor: string;
    peakLimiter: string;
  };
  musicVideoWorkflow: {
    maxDurationSeconds: number;
    requireAttachedCoverArt: boolean;
    copyAttachedCoverArt: boolean;
    extractClosedCaptions: boolean;
  };
  videoFilters: { hdrToSdr: string; cudaTonemap: string };
  encoders: readonly Readonly<EncoderCandidateConfig>[];
};

const commaList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
const numberValue = (value: string, label: string, minimum: number, maximum: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
};
const requireSection = (sections: Map<string, Map<string, string>>, name: string) => {
  const section = sections.get(name);
  if (!section) throw new Error(`config.ini is missing the [${name}] section`);
  return section;
};
const requireValue = (section: Map<string, string>, sectionName: string, key: string) => {
  const value = section.get(key);
  if (value === undefined) throw new Error(`[${sectionName}] is missing ${key}`);
  return value;
};

export const parseAppConfiguration = (ini: string): AppConfiguration => {
  const sections = parseIniSections(ini);
  const app = requireSection(sections, 'App');
  const media = requireSection(sections, 'Media Extensions');
  const audioBitrates = requireSection(sections, 'Audio Bitrates');
  const musicVideoWorkflow = requireSection(sections, 'Music Video Workflow');
  const audioFilters = requireSection(sections, 'Audio Filters');
  const videoFilters = requireSection(sections, 'Video Filters');
  const audioPreset = (name: 'Streaming' | 'Archive' | 'Passthrough'): AudioPresetConfig => {
    const sectionName = `Audio Preset: ${name}`;
    const section = requireSection(sections, sectionName);
    const codec = requireValue(section, sectionName, 'codec') as AudioPresetConfig['codec'];
    if (!['libopus', 'libfdk_aac', 'copy'].includes(codec)) throw new Error(`[${sectionName}] codec is invalid`);
    const extension = requireValue(section, sectionName, 'extension');
    return {
      codec,
      extension: extension || null,
      stereoBitrate: requireValue(section, sectionName, 'stereo_bitrate'),
      downmixBitrate: requireValue(section, sectionName, 'downmix_bitrate'),
      dynamicRangeCompression: booleanValue(
        requireValue(section, sectionName, 'dynamic_range_compression'),
        `[${sectionName}] dynamic_range_compression`,
      ),
    };
  };
  const encoders = [...sections.entries()].flatMap(([sectionName, section]) => {
    const match = /^Encoder: (.+)$/.exec(sectionName);
    if (!match) return [];
    const vendor = requireValue(section, sectionName, 'vendor') as VideoEncoderCapability['vendor'];
    const codec = requireValue(section, sectionName, 'codec') as VideoEncoderCapability['codec'];
    if (!['NVIDIA', 'AMD', 'Intel', 'Apple'].includes(vendor)) throw new Error(`[${sectionName}] vendor is invalid`);
    if (!['H.264', 'HEVC', 'AV1'].includes(codec)) throw new Error(`[${sectionName}] codec is invalid`);
    return [{
      id: match[1],
      label: requireValue(section, sectionName, 'label'),
      vendor,
      codec,
      platforms: commaList(requireValue(section, sectionName, 'platforms')) as NodeJS.Platform[],
      main10Enabled: booleanValue(requireValue(section, sectionName, 'main10'), `[${sectionName}] main10`),
      highEnabled: booleanValue(requireValue(section, sectionName, 'high'), `[${sectionName}] high`),
    }];
  });
  if (!encoders.length) throw new Error('config.ini must define at least one [Encoder: <name>] section');
  return Object.freeze({
    app: Object.freeze({
      name: requireValue(app, 'App', 'name'),
      codename: requireValue(app, 'App', 'codename'),
      updateRepository: requireValue(app, 'App', 'update_repository'),
      presetSourceUrl: requireValue(app, 'App', 'preset_source_url'),
      ffmpegReleaseApi: requireValue(app, 'App', 'ffmpeg_release_api'),
      ffmpegReleasesApi: requireValue(app, 'App', 'ffmpeg_releases_api'),
      rsgainReleaseApi: requireValue(app, 'App', 'rsgain_release_api'),
      ccextractorReleaseApi: requireValue(app, 'App', 'ccextractor_release_api'),
    }),
    mediaExtensions: Object.freeze({
      video: commaList(requireValue(media, 'Media Extensions', 'video')),
      audio: commaList(requireValue(media, 'Media Extensions', 'audio')),
    }),
    audioPresets: Object.freeze({
      Streaming: Object.freeze(audioPreset('Streaming')),
      Archive: Object.freeze(audioPreset('Archive')),
      Passthrough: Object.freeze(audioPreset('Passthrough')),
    }),
    audioBitrates: Object.freeze({
      aac: Object.freeze(commaList(requireValue(audioBitrates, 'Audio Bitrates', 'aac'))),
      opus: Object.freeze(commaList(requireValue(audioBitrates, 'Audio Bitrates', 'opus'))),
    }),
    audioFilters: Object.freeze({
      timestampResample: requireValue(audioFilters, 'Audio Filters', 'timestamp_resample'),
      downmix71: requireValue(audioFilters, 'Audio Filters', 'downmix_7_1'),
      downmix51: requireValue(audioFilters, 'Audio Filters', 'downmix_5_1'),
      downmixSurround: requireValue(audioFilters, 'Audio Filters', 'downmix_surround'),
      compressor: requireValue(audioFilters, 'Audio Filters', 'compressor'),
      peakLimiter: requireValue(audioFilters, 'Audio Filters', 'peak_limiter'),
    }),
    musicVideoWorkflow: Object.freeze({
      maxDurationSeconds: numberValue(
        requireValue(musicVideoWorkflow, 'Music Video Workflow', 'max_duration_seconds'),
        '[Music Video Workflow] max_duration_seconds',
        1,
        86_400,
      ),
      requireAttachedCoverArt: booleanValue(
        requireValue(musicVideoWorkflow, 'Music Video Workflow', 'require_attached_cover_art'),
        '[Music Video Workflow] require_attached_cover_art',
      ),
      copyAttachedCoverArt: booleanValue(
        requireValue(musicVideoWorkflow, 'Music Video Workflow', 'copy_attached_cover_art'),
        '[Music Video Workflow] copy_attached_cover_art',
      ),
      extractClosedCaptions: booleanValue(
        requireValue(musicVideoWorkflow, 'Music Video Workflow', 'extract_closed_captions'),
        '[Music Video Workflow] extract_closed_captions',
      ),
    }),
    videoFilters: Object.freeze({
      hdrToSdr: requireValue(videoFilters, 'Video Filters', 'hdr_to_sdr'),
      cudaTonemap: requireValue(videoFilters, 'Video Filters', 'cuda_tonemap'),
    }),
    encoders: Object.freeze(encoders.map((encoder) => Object.freeze(encoder))),
  });
};

export const EMPTY_APP_CONFIGURATION: AppConfiguration = Object.freeze({
  app: Object.freeze({
    name: '',
    codename: '',
    updateRepository: '',
    presetSourceUrl: '',
    ffmpegReleaseApi: '',
    ffmpegReleasesApi: '',
    rsgainReleaseApi: '',
    ccextractorReleaseApi: '',
  }),
  mediaExtensions: Object.freeze({ video: Object.freeze([]), audio: Object.freeze([]) }),
  audioPresets: Object.freeze({
    Streaming: Object.freeze({
      codec: 'copy', extension: null, stereoBitrate: '', downmixBitrate: '', dynamicRangeCompression: false,
    }),
    Archive: Object.freeze({
      codec: 'copy', extension: null, stereoBitrate: '', downmixBitrate: '', dynamicRangeCompression: false,
    }),
    Passthrough: Object.freeze({
      codec: 'copy', extension: null, stereoBitrate: '', downmixBitrate: '', dynamicRangeCompression: false,
    }),
  }),
  audioBitrates: Object.freeze({ aac: Object.freeze([]), opus: Object.freeze([]) }),
  audioFilters: Object.freeze({
    timestampResample: 'aresample={rate_prefix}async=1',
    downmix71: '',
    downmix51: '',
    downmixSurround: '',
    compressor: '',
    peakLimiter: '',
  }),
  musicVideoWorkflow: Object.freeze({
    maxDurationSeconds: 0,
    requireAttachedCoverArt: false,
    copyAttachedCoverArt: false,
    extractClosedCaptions: false,
  }),
  videoFilters: Object.freeze({ hdrToSdr: '', cudaTonemap: '' }),
  encoders: Object.freeze([]),
});

export let APP_CONFIG = EMPTY_APP_CONFIGURATION;
export let APP_NAME = 'EA Media Tools';
export let APP_CODENAME = '';
export let APP_UPDATE_REPOSITORY = 'eaforlife/media-converter';
export let PRESET_SOURCE_URL = APP_CONFIG.app.presetSourceUrl;
export let FFMPEG_RELEASE_API = APP_CONFIG.app.ffmpegReleaseApi;
export let FFMPEG_RELEASES_API = APP_CONFIG.app.ffmpegReleasesApi;
export let RSGAIN_RELEASE_API = APP_CONFIG.app.rsgainReleaseApi;
export let CCEXTRACTOR_RELEASE_API = APP_CONFIG.app.ccextractorReleaseApi;

export const setAppConfiguration = (configuration: AppConfiguration) => {
  APP_CONFIG = configuration;
  APP_NAME = configuration.app.name;
  APP_CODENAME = configuration.app.codename;
  APP_UPDATE_REPOSITORY = configuration.app.updateRepository;
  PRESET_SOURCE_URL = configuration.app.presetSourceUrl;
  FFMPEG_RELEASE_API = configuration.app.ffmpegReleaseApi;
  FFMPEG_RELEASES_API = configuration.app.ffmpegReleasesApi;
  RSGAIN_RELEASE_API = configuration.app.rsgainReleaseApi;
  CCEXTRACTOR_RELEASE_API = configuration.app.ccextractorReleaseApi;
};
