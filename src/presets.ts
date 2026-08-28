import type { AdvancedVideoSettings, ScaleMode } from './shared-types';
import type { OutputTier } from './video-output-profile';

export const MUSIC_VIDEO_PRESET_NAME = 'Music Video';
export const REQUIRED_BUILT_IN_PRESET_NAMES = ['Archive', 'Regular', 'Streaming', 'Cellular', MUSIC_VIDEO_PRESET_NAME] as const;
export type BuiltInPresetName = typeof REQUIRED_BUILT_IN_PRESET_NAMES[number];
export type PreferredVideoCodec = 'H.264' | 'HEVC' | 'AV1';
export type PresetAudioCodec = 'aac' | 'opus';
export type EncoderFamily = 'nvenc' | 'amf' | 'qsv' | 'vaapi' | 'videotoolbox' | 'software';

type AudioRates = Record<PresetAudioCodec, { stereo: string; surround: string }>;
type OutputTierDefaults = { encoderSpeed?: number; maxRate?: number };

export type BuiltInPresetDefinition = {
  name: string;
  description: string;
  format: 'mp4' | 'mkv';
  preferredVideoCodec: PreferredVideoCodec;
  encoderSpeed: number;
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
  advancedVideo: AdvancedVideoSettings;
};

export type BuiltInPresetCatalog = Readonly<Record<string, BuiltInPresetDefinition>>;

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

export const parseBuiltInPresets = (ini: string): BuiltInPresetCatalog => {
  const sections = parseIniSections(ini);
  for (const name of REQUIRED_BUILT_IN_PRESET_NAMES) {
    if (!sections.has(name)) throw new Error(`presets.ini is missing the [${name}] section`);
  }
  const parsed: Record<string, BuiltInPresetDefinition> = {};
  for (const [name, values] of sections) {
    if (name === 'Custom') throw new Error('presets.ini cannot define the reserved [Custom] section');
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
      outputTierDefaults: Object.fromEntries(['4k', '1080p', '720p', '360p'].map((tier) => [tier, {
        encoderSpeed: optionalNumberValue(optional(`encoder_speed_${tier}`), label(`encoder_speed_${tier}`), 1, 7),
        maxRate: optionalNumberValue(optional(`max_rate_${tier}`), label(`max_rate_${tier}`), 1, 1_000_000),
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
  return Object.freeze(parsed);
};
