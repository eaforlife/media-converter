import type { AdvancedVideoSettings, ScaleMode } from './shared-types';
import type { OutputTier, VideoOutputProfiles } from './video-output-profile';

export const MUSIC_VIDEO_PRESET_NAME = 'Music Video';
export const REQUIRED_BUILT_IN_PRESET_NAMES = ['Archive', 'Regular', 'Streaming', 'Cellular', MUSIC_VIDEO_PRESET_NAME] as const;
export type BuiltInPresetName = typeof REQUIRED_BUILT_IN_PRESET_NAMES[number];
export type PreferredVideoCodec = 'H.264' | 'HEVC' | 'AV1';
export type PresetAudioCodec = 'aac' | 'opus';
export type EncoderFamily = 'nvenc' | 'amf' | 'qsv' | 'vaapi' | 'videotoolbox' | 'software';
export const OUTPUT_TIERS: readonly OutputTier[] = ['4k', '1080p', '720p', '360p'];
export const ENCODER_FAMILIES: readonly EncoderFamily[] = ['nvenc', 'amf', 'qsv', 'vaapi', 'videotoolbox', 'software'];
const CODEC_KEYS: Readonly<Record<PreferredVideoCodec, string>> = {
  'H.264': 'h264', HEVC: 'hevc', AV1: 'av1',
};

type AudioRates = Record<PresetAudioCodec, { stereo: string; surround: string }>;
type OutputTierDefaults = {
  encoderSpeed?: number;
  resolution?: readonly [string, string];
  videoBitrate?: number;
  maxRate?: number;
  deliveryPreset?: string;
  quality: Partial<Record<EncoderFamily, string>>;
  codec: Partial<Record<PreferredVideoCodec, {
    encoderSpeed?: number;
    videoBitrate?: number;
    maxRate?: number;
  }>>;
};

export type BuiltInPresetDefinition = {
  name: string;
  description: string;
  format: 'mp4' | 'mkv';
  preferredVideoCodec: PreferredVideoCodec;
  encoderSpeed: number;
  encoderProfile: Partial<Record<PreferredVideoCodec, string>>;
  outputTierDefaults: Record<OutputTier, OutputTierDefaults>;
  encoderTune: Record<EncoderFamily, string>;
  quality: Record<EncoderFamily, string>;
  resolution: string;
  scale: ScaleMode;
  scaleLocked: boolean;
  deliveryMode: boolean;
  bitrateControl: boolean;
  bufferMultiplier: number;
  audioCodec: PresetAudioCodec;
  audioRates: AudioRates;
  dynamicRangeCompression: boolean;
  advancedVideo: AdvancedVideoSettings;
};

export type BuiltInPresetCatalog = Readonly<Record<string, BuiltInPresetDefinition>>;
export type BuiltInPresetConfiguration = Readonly<{
  version: string;
  outputProfiles: VideoOutputProfiles;
  presets: BuiltInPresetCatalog;
}>;

export const predefinedPresetNames = (catalog: BuiltInPresetCatalog, musicVideo: boolean) => musicVideo
  ? catalog[MUSIC_VIDEO_PRESET_NAME] ? [MUSIC_VIDEO_PRESET_NAME] : []
  : Object.keys(catalog).filter((name) => name !== MUSIC_VIDEO_PRESET_NAME);

export const booleanValue = (value: string, label: string) => {
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  throw new Error(`${label} must be 0 or 1`);
};

const numberValue = (value: string, label: string, minimum: number, maximum: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
};

const optionalNumberValue = (value: string, label: string, minimum: number, maximum: number) =>
  value === '' ? undefined : numberValue(value, label, minimum, maximum);

const resolutionValue = (value: string, label: string): readonly [string, string] => {
  const match = value.match(/^(-?\d+):(-?\d+)$/);
  if (!match || [match[1], match[2]].some((part) => Number(part) !== -2 && Number(part) <= 0)) {
    throw new Error(`${label} must contain two positive dimensions or -2`);
  }
  return [match[1], match[2]];
};

const enumValue = <T extends string>(value: string, allowed: readonly T[], label: string): T => {
  if (allowed.includes(value as T)) return value as T;
  throw new Error(`${label} must be one of: ${allowed.join(', ')}`);
};

export const parseIniSections = (ini: string) => {
  const sections = new Map<string, Map<string, string>>();
  let current: Map<string, string> | null = null;
  for (const [index, sourceLine] of ini.replace(/^\uFEFF/, '').split(/\r?\n/).entries()) {
    const line = sourceLine.trim();
    if (!line || line.startsWith(';') || line.startsWith('#')) continue;
    const section = line.match(/^\[([^\]]+)\]$/);
    if (section) {
      current = new Map<string, string>();
      sections.set(section[1].trim(), current);
      continue;
    }
    const separator = line.indexOf('=');
    if (!current || separator < 1) throw new Error(`Invalid presets.ini entry on line ${index + 1}`);
    current.set(line.slice(0, separator).trim(), line.slice(separator + 1).trim());
  }
  return sections;
};

export const parseBuiltInPresetConfiguration = (ini: string): BuiltInPresetConfiguration => {
  const firstEntry = ini.replace(/^\uFEFF/, '').split(/\r?\n/).map((line) => line.trim()).find(Boolean) ?? '';
  const versionMatch = firstEntry.match(/^\[Version: ([0-9a-f]{7,40})\]$/i);
  if (!versionMatch) throw new Error('presets.ini must begin with [Version: <commit>]');
  const versionSection = firstEntry.slice(1, -1);
  const sections = parseIniSections(ini);
  for (const name of REQUIRED_BUILT_IN_PRESET_NAMES) {
    if (!sections.has(name)) throw new Error(`presets.ini is missing the [${name}] section`);
  }
  const outputProfiles = Object.fromEntries(OUTPUT_TIERS.map((tier) => {
    const name = `Output: ${tier}`;
    const values = sections.get(name);
    if (!values) throw new Error(`presets.ini is missing the [${name}] section`);
    const get = (key: string) => {
      const value = values.get(key);
      if (value === undefined || value === '') throw new Error(`[${name}] is missing ${key}`);
      return value;
    };
    return [tier, Object.freeze({
      tier,
      scale: resolutionValue(get('resolution'), `[${name}] resolution`),
      videoBitrate: numberValue(get('video_bitrate'), `[${name}] video_bitrate`, 0, 1_000_000),
      maxRate: numberValue(get('max_rate'), `[${name}] max_rate`, 1, 1_000_000),
    })];
  })) as VideoOutputProfiles;
  const metadataSections = new Set([versionSection, ...OUTPUT_TIERS.map((tier) => `Output: ${tier}`)]);
  const parsed: Record<string, BuiltInPresetDefinition> = {};
  for (const [name, values] of sections) {
    if (name === 'Custom') throw new Error('presets.ini cannot define the reserved [Custom] section');
    if (metadataSections.has(name)) continue;
    const get = (key: string) => {
      const value = values.get(key);
      if (value === undefined || value === '') throw new Error(`[${name}] is missing ${key}`);
      return value;
    };
    const optional = (key: string) => values.get(key) ?? '';
    const label = (key: string) => `[${name}] ${key}`;
    parsed[name] = {
      name,
      description: get('description'),
      format: enumValue(get('format'), ['mp4', 'mkv'], label('format')),
      preferredVideoCodec: enumValue(get('preferred_video_codec'), ['H.264', 'HEVC', 'AV1'], label('preferred_video_codec')),
      encoderSpeed: numberValue(get('encoder_speed'), label('encoder_speed'), 1, 7),
      encoderProfile: Object.fromEntries(Object.entries(CODEC_KEYS).map(([codec, key]) => [
        codec, optional(`profile_${key}`) || undefined,
      ])) as Partial<Record<PreferredVideoCodec, string>>,
      outputTierDefaults: Object.fromEntries(OUTPUT_TIERS.map((tier) => [tier, {
        encoderSpeed: optionalNumberValue(optional(`encoder_speed_${tier}`), label(`encoder_speed_${tier}`), 1, 7),
        resolution: optional(`resolution_${tier}`)
          ? resolutionValue(optional(`resolution_${tier}`), label(`resolution_${tier}`))
          : undefined,
        videoBitrate: optionalNumberValue(optional(`video_bitrate_${tier}`), label(`video_bitrate_${tier}`), 0, 1_000_000),
        maxRate: optionalNumberValue(optional(`max_rate_${tier}`), label(`max_rate_${tier}`), 1, 1_000_000),
        deliveryPreset: optional(`delivery_preset_${tier}`) || undefined,
        quality: Object.fromEntries(ENCODER_FAMILIES.map((family) => [
          family, optional(`quality_${family}_${tier}`) || undefined,
        ])) as Partial<Record<EncoderFamily, string>>,
        codec: Object.fromEntries(Object.entries(CODEC_KEYS).map(([codec, key]) => [codec, {
          encoderSpeed: optionalNumberValue(optional(`encoder_speed_${key}_${tier}`), label(`encoder_speed_${key}_${tier}`), 1, 7),
          videoBitrate: optionalNumberValue(optional(`video_bitrate_${key}_${tier}`), label(`video_bitrate_${key}_${tier}`), 0, 1_000_000),
          maxRate: optionalNumberValue(optional(`max_rate_${key}_${tier}`), label(`max_rate_${key}_${tier}`), 1, 1_000_000),
        }])) as Partial<Record<PreferredVideoCodec, {
          encoderSpeed?: number; videoBitrate?: number; maxRate?: number;
        }>>,
      }])) as Record<OutputTier, OutputTierDefaults>,
      encoderTune: {
        nvenc: optional('tune_nvenc'), amf: optional('tune_amf'), qsv: optional('tune_qsv'),
        vaapi: optional('tune_vaapi'), videotoolbox: optional('tune_videotoolbox'), software: optional('tune_software'),
      },
      quality: {
        nvenc: get('quality_nvenc'), amf: get('quality_amf'),
        qsv: get('quality_qsv'), vaapi: get('quality_vaapi'),
        videotoolbox: get('quality_videotoolbox'), software: get('quality_software'),
      },
      resolution: get('resolution'),
      scale: enumValue(get('scale'), ['auto', '1080p', '720p', '360p', 'disabled'], label('scale')),
      scaleLocked: booleanValue(get('scale_locked'), label('scale_locked')),
      deliveryMode: booleanValue(get('delivery_mode'), label('delivery_mode')),
      bitrateControl: booleanValue(get('bitrate_control'), label('bitrate_control')),
      bufferMultiplier: numberValue(get('buffer_multiplier'), label('buffer_multiplier'), 0, 20),
      audioCodec: enumValue(get('audio_codec'), ['aac', 'opus'], label('audio_codec')),
      audioRates: {
        aac: { stereo: get('audio_aac_stereo'), surround: get('audio_aac_downmix') },
        opus: { stereo: get('audio_opus_stereo'), surround: get('audio_opus_downmix') },
      },
      dynamicRangeCompression: booleanValue(get('dynamic_range_compression'), label('dynamic_range_compression')),
      advancedVideo: {
        bFrames: booleanValue(get('b_frames'), label('b_frames')),
        multipass: numberValue(get('multipass'), label('multipass'), 0, 2) as AdvancedVideoSettings['multipass'],
        bRefMode: enumValue(get('b_ref_mode'), ['disabled', 'each', 'middle'], label('b_ref_mode')),
        adaptiveBFrames: booleanValue(get('adaptive_b_frames'), label('adaptive_b_frames')),
        sceneCutDetection: booleanValue(get('scene_cut_detection'), label('scene_cut_detection')),
        rcLookahead: numberValue(get('rc_lookahead'), label('rc_lookahead'), 0, 42),
        nonReferenceP: booleanValue(get('non_reference_p'), label('non_reference_p')),
        spatialAq: numberValue(get('spatial_aq'), label('spatial_aq'), 0, 15),
        temporalAq: booleanValue(get('temporal_aq'), label('temporal_aq')),
      },
    };
  }
  for (const preset of Object.values(parsed)) {
    for (const tier of OUTPUT_TIERS) {
      const deliveryPreset = preset.outputTierDefaults[tier].deliveryPreset;
      if (deliveryPreset && !parsed[deliveryPreset]) {
        throw new Error(`[${preset.name}] delivery_preset_${tier} references missing preset ${deliveryPreset}`);
      }
    }
  }
  return Object.freeze({
    version: versionMatch[1],
    outputProfiles: Object.freeze(outputProfiles),
    presets: Object.freeze(parsed),
  });
};

export const parseBuiltInPresets = (ini: string): BuiltInPresetCatalog =>
  parseBuiltInPresetConfiguration(ini).presets;

export const resolvePresetOutputDefaults = (
  configuration: BuiltInPresetConfiguration,
  preset: BuiltInPresetDefinition,
  tier: OutputTier,
  family: EncoderFamily,
  codec: PreferredVideoCodec = preset.preferredVideoCodec,
) => {
  const outputProfile = configuration.outputProfiles[tier];
  const overrides = preset.outputTierDefaults[tier];
  const codecOverrides = overrides.codec[codec] ?? {};
  const deliveryPreset = overrides.deliveryPreset
    ? configuration.presets[overrides.deliveryPreset]
    : preset;
  if (!deliveryPreset) throw new Error(`The ${overrides.deliveryPreset} preset is unavailable`);
  return {
    deliveryPreset,
    encoderSpeed: codecOverrides.encoderSpeed ?? overrides.encoderSpeed ?? preset.encoderSpeed,
    encoderProfile: preset.encoderProfile[codec] ?? '',
    resolution: overrides.resolution ?? outputProfile.scale,
    quality: overrides.quality[family] ?? deliveryPreset.quality[family],
    videoBitrate: codecOverrides.videoBitrate ?? overrides.videoBitrate ?? outputProfile.videoBitrate,
    maxRate: codecOverrides.maxRate ?? overrides.maxRate ?? outputProfile.maxRate,
  };
};
