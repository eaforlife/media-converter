import { booleanValue, parseIniSections } from './presets.ts';
import type { AdvancedVideoSettings, OutputFormat, SavedPreset, ScaleMode } from './shared-types';

const outputFormats: readonly OutputFormat[] = ['mp4', 'mkv', 'webm', 'm4a', 'opus', 'source'];
const scales: readonly ScaleMode[] = ['auto', '1080p', '720p', '360p', 'disabled'];

const integer = (value: string, label: string, minimum: number, maximum: number) => {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return parsed;
};

const oneOrZero = (value: boolean) => value ? '1' : '0';

export const isValidCustomPresetName = (name: string) => Boolean(name.trim())
  && !/[\]\r\n]/.test(name);

export const parseCustomPresets = (ini: string): SavedPreset[] => {
  const sections = parseIniSections(ini);
  return [...sections].map(([name, values]) => {
    const get = (key: string, fallback?: string) => {
      const value = values.get(key);
      if (value !== undefined) return value;
      if (fallback !== undefined) return fallback;
      throw new Error(`[${name}] is missing ${key}`);
    };
    const label = (key: string) => `[${name}] ${key}`;
    const format = get('format') as OutputFormat;
    if (!outputFormats.includes(format)) throw new Error(`${label('format')} is unsupported`);
    const scale = get('scale', 'disabled') as ScaleMode;
    if (!scales.includes(scale)) throw new Error(`${label('scale')} is unsupported`);
    const multipass = integer(get('multipass', '0'), label('multipass'), 0, 2) as AdvancedVideoSettings['multipass'];
    const bRefMode = get('b_ref_mode', 'disabled') as AdvancedVideoSettings['bRefMode'];
    if (!['disabled', 'each', 'middle'].includes(bRefMode)) throw new Error(`${label('b_ref_mode')} is unsupported`);
    return {
      name,
      description: name,
      workflow: get('workflow', 'video') as SavedPreset['workflow'],
      format,
      encoder: get('encoder', ''),
      encoderSpeed: integer(get('encoder_speed', '4'), label('encoder_speed'), 1, 7),
      encoderTune: get('encoder_tune', ''),
      encoderProfile: get('encoder_profile', ''),
      quality: get('quality', '20'),
      videoBitrate: get('video_bitrate', '0'),
      maxRate: get('max_rate', '0'),
      bufferMultiplier: integer(get('buffer_multiplier', '1'), label('buffer_multiplier'), 0, 20),
      bufferSize: get('buffer_size', '0'),
      deliveryMode: booleanValue(get('delivery_mode', '0'), label('delivery_mode')),
      advancedVideo: {
        bFrames: booleanValue(get('b_frames', '0'), label('b_frames')),
        multipass,
        bRefMode,
        adaptiveBFrames: booleanValue(get('adaptive_b_frames', '0'), label('adaptive_b_frames')),
        sceneCutDetection: booleanValue(get('scene_cut_detection', '0'), label('scene_cut_detection')),
        rcLookahead: integer(get('rc_lookahead', '0'), label('rc_lookahead'), 0, 42),
        nonReferenceP: booleanValue(get('non_reference_p', '0'), label('non_reference_p')),
        spatialAq: integer(get('spatial_aq', '0'), label('spatial_aq'), 0, 15),
        temporalAq: booleanValue(get('temporal_aq', '0'), label('temporal_aq')),
      },
      audioCodec: get('audio_codec', 'libfdk_aac') as SavedPreset['audioCodec'],
      audioBitrate: get('audio_bitrate', '192k'),
      filters: {
        autoCrop: booleanValue(get('auto_crop', '1'), label('auto_crop')),
        toneMapHdrToSdr: booleanValue(get('tone_map_hdr_to_sdr', '1'), label('tone_map_hdr_to_sdr')),
        pixelFormat10Bit: booleanValue(get('pixel_format_10_bit', '0'), label('pixel_format_10_bit')),
        scale,
        scaleLocked: booleanValue(get('scale_locked', '0'), label('scale_locked')),
        remuxAudio: true,
        remuxSubtitles: true,
        stripMetadata: booleanValue(get('strip_metadata', '1'), label('strip_metadata')),
        doNotReplaceAudio: booleanValue(get('do_not_replace_audio', '0'), label('do_not_replace_audio')),
        extractClosedCaptions: booleanValue(get('extract_closed_captions', '0'), label('extract_closed_captions')),
        downmixToStereo: booleanValue(get('downmix_to_stereo', '1'), label('downmix_to_stereo')),
        dynamicRangeCompression: booleanValue(get('dynamic_range_compression', '1'), label('dynamic_range_compression')),
        resampleLosslessTo48k: booleanValue(get('resample_lossless_to_48k', '1'), label('resample_lossless_to_48k')),
        normalizeAudio: booleanValue(get('normalize_audio', '1'), label('normalize_audio')),
      },
    };
  });
};

const serializePreset = (preset: SavedPreset) => `[${preset.name}]
description=${preset.name}
workflow=${preset.workflow ?? 'video'}
format=${preset.format}
encoder=${preset.encoder}
encoder_speed=${preset.encoderSpeed}
encoder_tune=${preset.encoderTune}
encoder_profile=${preset.encoderProfile}
quality=${preset.quality}
video_bitrate=${preset.videoBitrate}
max_rate=${preset.maxRate}
buffer_multiplier=${preset.bufferMultiplier}
buffer_size=${preset.bufferSize}
delivery_mode=${oneOrZero(preset.deliveryMode)}
audio_codec=${preset.audioCodec}
audio_bitrate=${preset.audioBitrate}
b_frames=${oneOrZero(preset.advancedVideo.bFrames)}
multipass=${preset.advancedVideo.multipass}
b_ref_mode=${preset.advancedVideo.bRefMode}
adaptive_b_frames=${oneOrZero(preset.advancedVideo.adaptiveBFrames)}
scene_cut_detection=${oneOrZero(preset.advancedVideo.sceneCutDetection)}
rc_lookahead=${preset.advancedVideo.rcLookahead}
non_reference_p=${oneOrZero(preset.advancedVideo.nonReferenceP)}
spatial_aq=${preset.advancedVideo.spatialAq}
temporal_aq=${oneOrZero(preset.advancedVideo.temporalAq)}
auto_crop=${oneOrZero(preset.filters.autoCrop)}
tone_map_hdr_to_sdr=${oneOrZero(preset.filters.toneMapHdrToSdr)}
pixel_format_10_bit=${oneOrZero(preset.filters.pixelFormat10Bit)}
scale=${preset.filters.scale}
scale_locked=${oneOrZero(preset.filters.scaleLocked)}
strip_metadata=${oneOrZero(preset.filters.stripMetadata)}
do_not_replace_audio=${oneOrZero(preset.filters.doNotReplaceAudio)}
extract_closed_captions=${oneOrZero(preset.filters.extractClosedCaptions)}
downmix_to_stereo=${oneOrZero(preset.filters.downmixToStereo)}
dynamic_range_compression=${oneOrZero(preset.filters.dynamicRangeCompression)}
resample_lossless_to_48k=${oneOrZero(preset.filters.resampleLosslessTo48k)}
normalize_audio=${oneOrZero(preset.filters.normalizeAudio)}`;

export const serializeCustomPresets = (presets: SavedPreset[]) => presets.map(serializePreset).join('\n\n') + (presets.length ? '\n' : '');
