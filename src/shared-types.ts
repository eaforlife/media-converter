export type SourceFile = {
  name: string;
  path: string;
  size: number;
  extension: string;
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
};
