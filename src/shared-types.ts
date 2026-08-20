export type SourceFile = {
  name: string;
  path: string;
  size: number;
  extension: string;
  media: MediaInfo | null;
  probeError?: string;
  previewDataUrl?: string;
  previewId?: string;
};

export type VideoStreamInfo = {
  index: number;
  language: string;
  languageLabel: string;
  flags: StreamFlags;
  codec: string;
  profile: string;
  pixelFormat: string;
  isHevcMain10: boolean;
  width: number;
  height: number;
  frameRate: string;
  hasHdr: boolean;
  hdrFormat: string | null;
  hasDolbyVision: boolean;
};

export type AudioStreamInfo = {
  index: number;
  codec: string;
  codecLabel: string;
  language: string;
  languageLabel: string;
  channels: number;
  channelLayout: string;
  isStereo: boolean;
  isAtmos: boolean;
  isTrueHd: boolean;
  isDts: boolean;
  isDolbyDigitalPlus: boolean;
  bitRate: number | null;
  flags: StreamFlags;
};

export type SubtitleKind = 'text' | 'image';

export type SubtitleStreamInfo = {
  index: number;
  codec: string;
  codecLabel: string;
  language: string;
  languageLabel: string;
  kind: SubtitleKind;
  isUtf8: boolean;
  flags: StreamFlags;
};

export type StreamFlags = {
  default: boolean;
  forced: boolean;
  hearingImpaired: boolean;
};

export type MediaInfo = {
  format: string;
  duration: number | null;
  video: VideoStreamInfo | null;
  audio: AudioStreamInfo[];
  subtitles: SubtitleStreamInfo[];
  chapterCount: number;
  suggestedCrop: string | null;
};

export type ScaleMode = 'auto' | '1080p' | '720p' | '360p' | 'disabled';

export type FilterSettings = {
  autoCrop: boolean;
  toneMapHdrToSdr: boolean;
  pixelFormat10Bit: boolean;
  scale: ScaleMode;
  scaleLocked: boolean;
  remuxAudio: true;
  remuxSubtitles: true;
  stripMetadata: true;
  doNotReplaceAudio: boolean;
};

export type VideoEncoderCapability = {
  id: string;
  label: string;
  vendor: 'NVIDIA' | 'AMD' | 'Intel' | 'Apple';
  codec: 'H.264' | 'HEVC' | 'AV1';
  tenBit: boolean;
};

export type HardwareCapabilities = {
  checkedAt: string;
  adapters: string[];
  ignoredAdapters: string[];
  cudaAvailable: boolean;
  nvdecAvailable: boolean;
  cuvidDecoders: string[];
  amfDecodeAvailable: boolean;
  qsvDecodeAvailable: boolean;
  qsvDecoders: string[];
  vaapiAvailable: boolean;
  vaapiDevice: string | null;
  encoders: VideoEncoderCapability[];
};

export type SavedPreset = {
  name: string;
  format: 'mp4' | 'mkv' | 'webm';
  encoder: string;
  quality: string;
  videoBitrate: string;
  maxRate: string;
  bufferMultiplier: number;
  bufferSize: string;
  deliveryMode: boolean;
  audioCodec: 'libfdk_aac' | 'libopus' | 'copy';
  audioBitrate: string;
  filters: FilterSettings;
};

export type AppSettings = {
  hardwareAcceleration: boolean;
  useStableFfmpeg: boolean;
  smartFileNaming: boolean;
  lastPreset: string;
  lastSourceDirectory: string;
  customPresets: SavedPreset[];
  workingPreset: SavedPreset | null;
};

export type RuntimePhase =
  | 'checking-local'
  | 'checking-release'
  | 'downloading'
  | 'extracting'
  | 'verifying'
  | 'ready'
  | 'development'
  | 'error';

export type RuntimeState = {
  phase: RuntimePhase;
  message: string;
  progress: number | null;
  appVersion: string;
  isPackaged: boolean;
  updateEnabled: boolean;
  ffmpegAvailable: boolean;
  ffmpegPath: string;
  ffprobePath: string;
  ffmpegVersion: string | null;
  releaseTag: string | null;
  ffmpegChannel: 'stable' | 'unstable';
  rsgainAvailable: boolean;
  rsgainPath: string;
  rsgainVersion: string | null;
};

export type EncodeJob = {
  sourceName: string;
  sourcePath: string;
  outputPath: string;
  duration: number | null;
  args: string[];
  replaceSourcePath?: string;
};

export type EncodeProgressPhase =
  | 'starting'
  | 'encoding'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'queue-completed'
  | 'queue-failed'
  | 'queue-cancelled';

export type EncodeProgress = {
  phase: EncodeProgressPhase;
  jobIndex: number;
  totalJobs: number;
  sourceName: string;
  outputPath: string;
  percent: number | null;
  bitrate: string;
  fps: string;
  runTimeSeconds: number;
  etaSeconds: number | null;
  speed: string;
  command?: string[];
  message?: string;
};

export type EncodeStartResult = {
  started: boolean;
  message?: string;
};
