import { booleanValue, parseIniSections } from './presets.ts';
import type { HardwareCapabilities, VideoEncoderCapability } from './shared-types';
import { parsePersonalizedDefaults, type PersonalizedDefaults } from './personalized-defaults.ts';

export const URGENT_UPDATE_SOURCE_URL = 'https://raw.githubusercontent.com/eaforlife/media-converter/main/updatepolicy';

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
    configSourceUrl: string;
    ffmpegReleaseApi: string;
    ffmpegReleasesApi: string;
    rsgainReleaseApi: string;
    ccextractorReleaseApi: string;
  };
  mediaExtensions: { video: readonly string[]; audio: readonly string[] };
  videoDefaults: {
    preset: string;
    codec: 'H.264' | 'HEVC' | 'AV1';
    main10: boolean;
    outputProfiles: Readonly<Record<'4k' | '1080p' | '720p' | '360p', {
      tier: '4k' | '1080p' | '720p' | '360p';
      scale: readonly [string, string];
      videoBitrate: number;
      maxRate: number;
    }>>;
    codecRateMultipliers: Readonly<{ hevc: number; hevcMain10: number; av1: number; av1TenBit: number }>;
    main10Advanced: Readonly<{ spatialAq: number; bFrames: boolean }>;
    bufferMultiplier: number;
  };
  systemCapabilities: Readonly<{
    cacheTag: string;
    driverVersion: string;
    ffmpegVersion: string;
    checkedAt: string;
    capabilities: HardwareCapabilities;
  }> | null;
  personalizedDefaults: PersonalizedDefaults;
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
const requireHttpsUrl = (value: string, label: string) => {
  let parsed: URL;
  try { parsed = new URL(value); } catch { throw new Error(`${label} must be a valid HTTPS URL`); }
  if (parsed.protocol !== 'https:') throw new Error(`${label} must be a valid HTTPS URL`);
  return value;
};

export const parseAppConfiguration = (ini: string): AppConfiguration => {
  const sections = parseIniSections(ini);
  const app = requireSection(sections, 'App');
  const media = requireSection(sections, 'Media Extensions');
  const uiDefaults = requireSection(sections, 'UI Defaults');
  const videoOutputProfiles = Object.fromEntries((['4k', '1080p', '720p', '360p'] as const).map((tier) => {
    const sectionName = `Video Output: ${tier}`;
    const section = requireSection(sections, sectionName);
    const resolution = requireValue(section, sectionName, 'resolution').split(':');
    if (resolution.length !== 2 || resolution.some((value) => !/^-?\d+$/.test(value))) {
      throw new Error(`[${sectionName}] resolution must contain two integer dimensions`);
    }
    return [tier, Object.freeze({
      tier,
      scale: Object.freeze([resolution[0], resolution[1]]) as readonly [string, string],
      videoBitrate: numberValue(requireValue(section, sectionName, 'h264_bitrate'), `[${sectionName}] h264_bitrate`, 0, 1_000_000),
      maxRate: numberValue(requireValue(section, sectionName, 'h264_max_rate'), `[${sectionName}] h264_max_rate`, 1, 1_000_000),
    })];
  })) as AppConfiguration['videoDefaults']['outputProfiles'];
  const rateMultipliers = requireSection(sections, 'Video Codec Rate Multipliers');
  const rateMultiplier = (key: string) => {
    const value = Number(requireValue(rateMultipliers, 'Video Codec Rate Multipliers', key));
    if (!Number.isFinite(value) || value <= 0 || value > 10) {
      throw new Error(`[Video Codec Rate Multipliers] ${key} must be greater than 0 and at most 10`);
    }
    return value;
  };
  const main10Advanced = requireSection(sections, 'Main10 Defaults');
  const videoBehavior = requireSection(sections, 'Video Behavior');
  const defaultCodec = requireValue(uiDefaults, 'UI Defaults', 'default_video_codec') as AppConfiguration['videoDefaults']['codec'];
  if (!['H.264', 'HEVC', 'AV1'].includes(defaultCodec)) throw new Error('[UI Defaults] default_video_codec is invalid');
  const audioBitrates = requireSection(sections, 'Audio Bitrates');
  const musicVideoWorkflow = requireSection(sections, 'Music Video Workflow');
  const audioFilters = requireSection(sections, 'Audio Filters');
  const videoFilters = requireSection(sections, 'Video Filters');
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
      configSourceUrl: requireHttpsUrl(requireValue(app, 'App', 'config_source_url'), '[App] config_source_url'),
      ffmpegReleaseApi: requireValue(app, 'App', 'ffmpeg_release_api'),
      ffmpegReleasesApi: requireValue(app, 'App', 'ffmpeg_releases_api'),
      rsgainReleaseApi: requireValue(app, 'App', 'rsgain_release_api'),
      ccextractorReleaseApi: requireValue(app, 'App', 'ccextractor_release_api'),
    }),
    mediaExtensions: Object.freeze({
      video: commaList(requireValue(media, 'Media Extensions', 'video')),
      audio: commaList(requireValue(media, 'Media Extensions', 'audio')),
    }),
    videoDefaults: Object.freeze({
      preset: requireValue(uiDefaults, 'UI Defaults', 'default_video_preset'),
      codec: defaultCodec,
      main10: booleanValue(requireValue(uiDefaults, 'UI Defaults', 'default_main10'), '[UI Defaults] default_main10'),
      outputProfiles: Object.freeze(videoOutputProfiles),
      codecRateMultipliers: Object.freeze({
        hevc: rateMultiplier('hevc'), hevcMain10: rateMultiplier('hevc_main10'),
        av1: rateMultiplier('av1'), av1TenBit: rateMultiplier('av1_10bit'),
      }),
      main10Advanced: Object.freeze({
        spatialAq: numberValue(requireValue(main10Advanced, 'Main10 Defaults', 'spatial_aq'), '[Main10 Defaults] spatial_aq', 0, 15),
        bFrames: booleanValue(requireValue(main10Advanced, 'Main10 Defaults', 'b_frames'), '[Main10 Defaults] b_frames'),
      }),
      bufferMultiplier: numberValue(requireValue(videoBehavior, 'Video Behavior', 'buffer_multiplier'), '[Video Behavior] buffer_multiplier', 1, 10),
    }),
    systemCapabilities: (() => {
      const cache = sections.get('System Capability Cache');
      if (!cache) return null;
      const raw = cache.get('capabilities_json');
      if (!raw) return null;
      let capabilities: HardwareCapabilities;
      try {
        capabilities = JSON.parse(raw) as HardwareCapabilities;
      } catch {
        throw new Error('[System Capability Cache] capabilities_json must be valid JSON');
      }
      if (!capabilities || !Array.isArray(capabilities.encoders) || !Array.isArray(capabilities.adapters)) {
        throw new Error('[System Capability Cache] capabilities_json has an invalid shape');
      }
      return Object.freeze({
        cacheTag: cache.get('cache_tag') ?? '',
        driverVersion: cache.get('driver_version') ?? '',
        ffmpegVersion: cache.get('ffmpeg_version') ?? '',
        checkedAt: cache.get('checked_at') ?? '',
        capabilities: Object.freeze(capabilities),
      });
    })(),
    personalizedDefaults: Object.freeze(parsePersonalizedDefaults(sections.get('Personalized Defaults'))),
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
    configSourceUrl: '',
    ffmpegReleaseApi: '',
    ffmpegReleasesApi: '',
    rsgainReleaseApi: '',
    ccextractorReleaseApi: '',
  }),
  mediaExtensions: Object.freeze({ video: Object.freeze([]), audio: Object.freeze([]) }),
  videoDefaults: Object.freeze({
    preset: '', codec: 'H.264', main10: false,
    outputProfiles: Object.freeze({}) as AppConfiguration['videoDefaults']['outputProfiles'],
    codecRateMultipliers: Object.freeze({ hevc: 1, hevcMain10: 1, av1: 1, av1TenBit: 1 }),
    main10Advanced: Object.freeze({ spatialAq: 0, bFrames: false }),
    bufferMultiplier: 1,
  }),
  systemCapabilities: null,
  personalizedDefaults: Object.freeze({
    hardwareAcceleration: true, useStableFfmpeg: true, simultaneousEncoding: true,
    smartFileNaming: true, lastPreset: 'Streaming', lastSourceDirectory: '',
    workingPreset: null, separateAudioDirectory: true,
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
