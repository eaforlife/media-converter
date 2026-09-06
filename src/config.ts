import { booleanValue, parseIniSections } from './presets.ts';
import type { VideoEncoderCapability } from './shared-types';

export const DEFAULT_CONFIG_INI = `[App]
name=EA Media Tools
codename=jaguar
update_repository=eaforlife/media-converter
preset_source_url=https://raw.githubusercontent.com/eaforlife/media-converter/main/presets.ini
ffmpeg_release_api=https://api.github.com/repos/jellyfin/jellyfin-ffmpeg/releases/latest
ffmpeg_releases_api=https://api.github.com/repos/jellyfin/jellyfin-ffmpeg/releases?per_page=20
rsgain_release_api=https://api.github.com/repos/complexlogic/rsgain/releases/tags/v3.7
ccextractor_release_api=https://api.github.com/repos/CCExtractor/ccextractor/releases/latest

[Media Extensions]
video=mp4,mkv,mov,avi,webm,m4v,mpg,mpeg,wmv,flv,ts,mts,m2ts,vob,ogv,3gp,3g2
audio=aac,ac3,aif,aiff,alac,ape,dts,eac3,flac,m4a,mka,mp3,oga,ogg,opus,tta,wav,wma,wv

[Audio Preset: Streaming]
codec=libopus
extension=opus
stereo_bitrate=96k
downmix_bitrate=128k
dynamic_range_compression=1

[Audio Preset: Archive]
codec=libfdk_aac
extension=m4a
stereo_bitrate=224k
downmix_bitrate=256k
dynamic_range_compression=0

[Audio Preset: Passthrough]
codec=copy
extension=
stereo_bitrate=
downmix_bitrate=
dynamic_range_compression=0

[Audio Filters]
music_video_aac_bitrate=224k
timestamp_resample=aresample={rate_prefix}async=1
downmix_7_1=pan=stereo|c0<c0+0.707*c2+0.707*c4+0.707*c6|c1<c1+0.707*c2+0.707*c5+0.707*c7
downmix_5_1=pan=stereo|c0<c0+0.707*c2+0.707*c4|c1<c1+0.707*c2+0.707*c5
downmix_surround=aformat=channel_layouts=stereo
compressor=acompressor=threshold=0.063096:ratio=4:attack=20:release=250:makeup=1.995262:knee=2.83
peak_limiter=alimiter=limit=0.95:attack=5:release=50:latency=1

[Video Filters]
hdr_to_sdr=zscale=t=linear:npl=100,format=gbrpf32le,zscale=p=bt709,tonemap=tonemap=hable:desat=0,zscale=t=bt709:m=bt709:r=tv,format={format}
cuda_tonemap=tonemap_cuda=format={format}:p=bt709:t=bt709:m=bt709:tonemap=bt2390:peak=100:desat=0

[Encoder: h264_nvenc]
label=H.264 (NVENC)
vendor=NVIDIA
codec=H.264
platforms=win32,linux
ten_bit_test=0

[Encoder: hevc_nvenc]
label=H.265 / HEVC (NVENC)
vendor=NVIDIA
codec=HEVC
platforms=win32,linux
ten_bit_test=1

[Encoder: av1_nvenc]
label=AV1 (NVENC)
vendor=NVIDIA
codec=AV1
platforms=win32,linux
ten_bit_test=0

[Encoder: h264_amf]
label=H.264 (AMD AMF)
vendor=AMD
codec=H.264
platforms=win32
ten_bit_test=0

[Encoder: hevc_amf]
label=H.265 / HEVC (AMD AMF)
vendor=AMD
codec=HEVC
platforms=win32
ten_bit_test=1

[Encoder: av1_amf]
label=AV1 (AMD AMF)
vendor=AMD
codec=AV1
platforms=win32
ten_bit_test=0

[Encoder: h264_qsv]
label=H.264 (Intel QSV)
vendor=Intel
codec=H.264
platforms=win32,linux
ten_bit_test=0

[Encoder: hevc_qsv]
label=H.265 / HEVC (Intel QSV)
vendor=Intel
codec=HEVC
platforms=win32,linux
ten_bit_test=1

[Encoder: av1_qsv]
label=AV1 (Intel QSV)
vendor=Intel
codec=AV1
platforms=win32,linux
ten_bit_test=0

[Encoder: h264_videotoolbox]
label=H.264 (VideoToolbox)
vendor=Apple
codec=H.264
platforms=darwin
ten_bit_test=0

[Encoder: hevc_videotoolbox]
label=H.265 / HEVC (VideoToolbox)
vendor=Apple
codec=HEVC
platforms=darwin
ten_bit_test=1

[Encoder: av1_videotoolbox]
label=AV1 (VideoToolbox)
vendor=Apple
codec=AV1
platforms=darwin
ten_bit_test=0
`;

export type AudioPresetConfig = {
  codec: 'libopus' | 'libfdk_aac' | 'copy';
  extension: string | null;
  stereoBitrate: string;
  downmixBitrate: string;
  dynamicRangeCompression: boolean;
};
export type EncoderCandidateConfig = Omit<VideoEncoderCapability, 'tenBit'> & {
  tenBitTest?: boolean;
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
  audioFilters: {
    musicVideoAacBitrate: string;
    timestampResample: string;
    downmix71: string;
    downmix51: string;
    downmixSurround: string;
    compressor: string;
    peakLimiter: string;
  };
  videoFilters: { hdrToSdr: string; cudaTonemap: string };
  encoders: readonly Readonly<EncoderCandidateConfig>[];
};

const commaList = (value: string) => value.split(',').map((item) => item.trim()).filter(Boolean);
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
      tenBitTest: booleanValue(requireValue(section, sectionName, 'ten_bit_test'), `[${sectionName}] ten_bit_test`),
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
    audioFilters: Object.freeze({
      musicVideoAacBitrate: requireValue(audioFilters, 'Audio Filters', 'music_video_aac_bitrate'),
      timestampResample: requireValue(audioFilters, 'Audio Filters', 'timestamp_resample'),
      downmix71: requireValue(audioFilters, 'Audio Filters', 'downmix_7_1'),
      downmix51: requireValue(audioFilters, 'Audio Filters', 'downmix_5_1'),
      downmixSurround: requireValue(audioFilters, 'Audio Filters', 'downmix_surround'),
      compressor: requireValue(audioFilters, 'Audio Filters', 'compressor'),
      peakLimiter: requireValue(audioFilters, 'Audio Filters', 'peak_limiter'),
    }),
    videoFilters: Object.freeze({
      hdrToSdr: requireValue(videoFilters, 'Video Filters', 'hdr_to_sdr'),
      cudaTonemap: requireValue(videoFilters, 'Video Filters', 'cuda_tonemap'),
    }),
    encoders: Object.freeze(encoders.map((encoder) => Object.freeze(encoder))),
  });
};

export let APP_CONFIG = parseAppConfiguration(DEFAULT_CONFIG_INI);
export let APP_NAME = APP_CONFIG.app.name;
export let APP_CODENAME = APP_CONFIG.app.codename;
export let APP_UPDATE_REPOSITORY = APP_CONFIG.app.updateRepository;
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
