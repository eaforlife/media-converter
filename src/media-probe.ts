import { execFile } from 'node:child_process';
import type {
  AudioStreamInfo,
  MediaInfo,
  StreamFlags,
  SubtitleStreamInfo,
  VideoStreamInfo,
} from './shared-types';

type ProbeStream = {
  index?: number;
  codec_type?: string;
  codec_name?: string;
  codec_long_name?: string;
  codec_tag_string?: string;
  profile?: string;
  pix_fmt?: string;
  bits_per_raw_sample?: string;
  width?: number;
  height?: number;
  channels?: number;
  bit_rate?: string;
  channel_layout?: string;
  avg_frame_rate?: string;
  r_frame_rate?: string;
  color_transfer?: string;
  color_primaries?: string;
  tags?: Record<string, string>;
  disposition?: Record<string, number>;
  side_data_list?: Array<Record<string, unknown>>;
};

type ProbeOutput = {
  streams?: ProbeStream[];
  chapters?: unknown[];
  format?: { format_name?: string; duration?: string };
};

const TEXT_SUBTITLE_CODECS = new Set([
  'ass', 'ssa', 'subrip', 'srt', 'text', 'webvtt', 'mov_text', 'microdvd',
  'mpl2', 'jacosub', 'sami', 'realtext', 'stl', 'subviewer', 'subviewer1',
]);

const LANGUAGE_NAMES: Record<string, string> = {
  eng: 'English', en: 'English', spa: 'Spanish', es: 'Spanish', fra: 'French', fre: 'French', fr: 'French',
  deu: 'German', ger: 'German', de: 'German', ita: 'Italian', it: 'Italian', por: 'Portuguese', pt: 'Portuguese',
  jpn: 'Japanese', ja: 'Japanese', kor: 'Korean', ko: 'Korean', zho: 'Chinese', chi: 'Chinese', zh: 'Chinese',
  rus: 'Russian', ru: 'Russian', ara: 'Arabic', ar: 'Arabic', hin: 'Hindi', hi: 'Hindi', und: 'Unknown',
};

const languageName = (language?: string) => {
  const normalized = (language || 'und').trim().toLowerCase();
  return LANGUAGE_NAMES[normalized] ?? normalized.toUpperCase();
};

const flagsOf = (stream: ProbeStream): StreamFlags => ({
  default: Boolean(stream.disposition?.default),
  forced: Boolean(stream.disposition?.forced),
  hearingImpaired: Boolean(stream.disposition?.hearing_impaired),
});

const sideDataText = (stream: ProbeStream) => JSON.stringify(stream.side_data_list ?? []).toLowerCase();
const searchableText = (stream: ProbeStream) => [
  stream.codec_name, stream.codec_long_name, stream.codec_tag_string, stream.profile,
  ...Object.values(stream.tags ?? {}), sideDataText(stream),
].filter(Boolean).join(' ').toLowerCase();

const parseFrameRate = (stream: ProbeStream) => {
  const raw = stream.avg_frame_rate || stream.r_frame_rate || '0/0';
  const [numerator, denominator] = raw.split('/').map(Number);
  if (!numerator || !denominator) return raw;
  const fps = numerator / denominator;
  return Number.isInteger(fps) ? `${fps} fps` : `${fps.toFixed(2)} fps`;
};

const videoInfo = (stream: ProbeStream): VideoStreamInfo => {
  const text = searchableText(stream);
  const transfer = (stream.color_transfer ?? '').toLowerCase();
  const hasDolbyVision = /dolby.?vision|dovi|dvhe|dvh1/.test(text);
  const isPq = transfer === 'smpte2084';
  const isHlg = transfer === 'arib-std-b67';
  const hasHdrMetadata = /mastering display|content light level|hdr10/.test(text);
  const hasHdr = isPq || isHlg || hasHdrMetadata;
  let hdrFormat: string | null = null;
  if (isHlg) hdrFormat = 'HLG';
  else if (hasHdr) hdrFormat = /hdr10\+|dynamic hdr plus|smpte2094/.test(text) ? 'HDR10+' : 'HDR10';

  return {
    index: stream.index ?? 0,
    codec: (stream.codec_name || 'unknown').toUpperCase(),
    profile: stream.profile || 'Unknown',
    pixelFormat: stream.pix_fmt || 'unknown',
    isHevcMain10: (stream.codec_name || '').toLowerCase() === 'hevc' && (
      /main\s*10/i.test(stream.profile || '') || /10/.test(stream.pix_fmt || '') || stream.bits_per_raw_sample === '10'
    ),
    width: stream.width ?? 0,
    height: stream.height ?? 0,
    frameRate: parseFrameRate(stream),
    hasHdr,
    hdrFormat,
    hasDolbyVision,
  };
};

const channelLabel = (channels: number, layout: string) => {
  if (layout) return layout.replace(/\(side\)/gi, '').toUpperCase();
  if (channels === 1) return 'Mono';
  if (channels === 2) return 'Stereo';
  return `${channels} channels`;
};

const audioInfo = (stream: ProbeStream): AudioStreamInfo => {
  const codec = (stream.codec_name || 'unknown').toLowerCase();
  const text = searchableText(stream);
  const channels = stream.channels ?? 0;
  const layout = stream.channel_layout ?? '';
  const isAtmos = /atmos|joint object coding|\bjoc\b/.test(text);
  const isTrueHd = codec === 'truehd' || /truehd/.test(text);
  const isDts = codec.startsWith('dts') || /\bdts(?:-hd)?\b/.test(text);
  const isDolbyDigitalPlus = codec === 'eac3' || /e-?ac-?3|dolby digital plus|\bddp\b/.test(text);
  let family = (stream.codec_long_name || codec).replace(/\s*\([^)]*\)\s*/g, ' ').trim();
  if (isAtmos) family = 'Dolby Atmos';
  else if (isTrueHd) family = 'Dolby TrueHD';
  else if (isDolbyDigitalPlus) family = 'Dolby Digital Plus (DDP)';
  else if (codec === 'ac3') family = 'Dolby Digital (AC-3)';
  else if (isDts) family = /ma|master audio/.test(text) ? 'DTS-HD Master Audio' : 'DTS';
  else if (codec === 'aac') family = 'AAC';
  else if (codec === 'opus') family = 'Opus';

  const language = (stream.tags?.language || 'und').toLowerCase();
  const layoutLabel = channelLabel(channels, layout);
  return {
    index: stream.index ?? 0,
    codec,
    codecLabel: channels <= 2 ? `${layoutLabel} · ${family}` : `${family} · ${layoutLabel}`,
    language,
    languageLabel: languageName(language),
    channels,
    channelLayout: layoutLabel,
    isStereo: channels === 2,
    isAtmos,
    isTrueHd,
    isDts,
    isDolbyDigitalPlus,
    bitRate: Number.isFinite(Number(stream.bit_rate)) ? Number(stream.bit_rate) : null,
    flags: flagsOf(stream),
  };
};

const subtitleInfo = (stream: ProbeStream): SubtitleStreamInfo => {
  const codec = (stream.codec_name || 'unknown').toLowerCase();
  const kind = TEXT_SUBTITLE_CODECS.has(codec) ? 'text' : 'image';
  const language = (stream.tags?.language || 'und').toLowerCase();
  const labels: Record<string, string> = {
    subrip: 'SubRip (SRT)', srt: 'SubRip (SRT)', webvtt: 'WebVTT', mov_text: 'MOV text',
    ass: 'ASS text', ssa: 'SSA text', hdmv_pgs_subtitle: 'PGS image', dvd_subtitle: 'VobSub image',
    dvb_subtitle: 'DVB image', xsub: 'XSUB image',
  };
  return {
    index: stream.index ?? 0,
    codec,
    codecLabel: labels[codec] ?? `${codec.toUpperCase()} ${kind}`,
    language,
    languageLabel: languageName(language),
    kind,
    isUtf8: kind === 'text',
    flags: flagsOf(stream),
  };
};

export const probeMedia = (ffprobePath: string, sourcePath: string): Promise<MediaInfo> =>
  new Promise((resolve, reject) => {
    execFile(ffprobePath, [
      '-v', 'error', '-print_format', 'json', '-show_format', '-show_streams',
      '-show_chapters', sourcePath,
    ], { timeout: 30_000, windowsHide: true, maxBuffer: 16 * 1024 * 1024 }, (error, stdout) => {
      if (error) {
        reject(new Error(`Unable to inspect this video: ${error.message}`));
        return;
      }
      try {
        const output = JSON.parse(stdout) as ProbeOutput;
        const streams = output.streams ?? [];
        const duration = Number(output.format?.duration);
        resolve({
          format: output.format?.format_name ?? 'unknown',
          duration: Number.isFinite(duration) ? duration : null,
          video: streams.find((stream) => stream.codec_type === 'video')
            ? videoInfo(streams.find((stream) => stream.codec_type === 'video') as ProbeStream)
            : null,
          audio: streams.filter((stream) => stream.codec_type === 'audio').map(audioInfo),
          subtitles: streams.filter((stream) => stream.codec_type === 'subtitle').map(subtitleInfo),
          chapterCount: output.chapters?.length ?? 0,
          suggestedCrop: null,
        });
      } catch (parseError) {
        reject(new Error(parseError instanceof Error ? parseError.message : 'ffprobe returned invalid data'));
      }
    });
  });
