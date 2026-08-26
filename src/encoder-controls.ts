export type EncoderSpeed = 1 | 2 | 3 | 4 | 5 | 6 | 7;

export type EncoderTuneOption = {
  value: string;
  label: string;
};

const SPEEDS: readonly EncoderSpeed[] = [1, 2, 3, 4, 5, 6, 7];
const QSV_PRESETS = ['veryfast', 'faster', 'fast', 'medium', 'slow', 'slower', 'veryslow'] as const;
const SOFTWARE_PRESETS = ['ultrafast', 'veryfast', 'fast', 'medium', 'slow', 'slower', 'veryslow'] as const;
const SVT_PRESETS = ['13', '11', '9', '7', '5', '3', '0'] as const;

export const normalizeEncoderSpeed = (value: number): EncoderSpeed => {
  const rounded = Math.round(value);
  return SPEEDS.includes(rounded as EncoderSpeed) ? rounded as EncoderSpeed : 4;
};

export const supportsEncoderSpeed = (encoder: string) => encoder.endsWith('_nvenc')
  || encoder.endsWith('_qsv')
  || encoder.endsWith('_amf')
  || encoder.endsWith('_videotoolbox')
  || encoder === 'libx264'
  || encoder === 'libx265'
  || encoder === 'libsvtav1';

export const encoderSpeedLabel = (encoder: string, speed: EncoderSpeed) => {
  if (encoder.endsWith('_nvenc')) return `P${speed}`;
  if (encoder.endsWith('_qsv')) return QSV_PRESETS[speed - 1];
  if (encoder.endsWith('_amf')) {
    return speed <= 2 ? 'speed' : speed <= 4 ? 'balanced' : 'quality';
  }
  if (encoder === 'libx264' || encoder === 'libx265') return SOFTWARE_PRESETS[speed - 1];
  if (encoder === 'libsvtav1') return `preset ${SVT_PRESETS[speed - 1]}`;
  if (encoder.endsWith('_videotoolbox')) return speed <= 3 ? 'prioritize speed' : 'prioritize quality';
  return '';
};

export const encoderSpeedArguments = (encoder: string, requestedSpeed: number) => {
  const speed = normalizeEncoderSpeed(requestedSpeed);
  if (encoder.endsWith('_nvenc')) return ['-preset', `p${speed}`];
  if (encoder.endsWith('_qsv')) return ['-preset', QSV_PRESETS[speed - 1]];
  if (encoder.endsWith('_amf')) {
    const preset = speed <= 2 ? 'speed' : speed <= 4 ? 'balanced' : 'quality';
    return ['-quality', preset];
  }
  if (encoder === 'libx264' || encoder === 'libx265') return ['-preset', SOFTWARE_PRESETS[speed - 1]];
  if (encoder === 'libsvtav1') return ['-preset', SVT_PRESETS[speed - 1]];
  if (encoder.endsWith('_videotoolbox')) return ['-prio_speed', speed <= 3 ? '1' : '0'];
  return [];
};

export const encoderTuneOptions = (encoder: string): readonly EncoderTuneOption[] => {
  if (encoder.endsWith('_nvenc')) return [
    { value: '', label: 'None' }, { value: 'hq', label: 'High quality' },
    { value: 'll', label: 'Low latency' }, { value: 'ull', label: 'Ultra-low latency' },
    { value: 'lossless', label: 'Lossless' },
  ];
  if (encoder.endsWith('_amf')) return [
    { value: '', label: 'None' }, { value: 'transcoding', label: 'Transcoding' },
    { value: 'lowlatency', label: 'Low latency' }, { value: 'ultralowlatency', label: 'Ultra-low latency' },
    { value: 'webcam', label: 'Webcam' }, { value: 'high_quality', label: 'High quality' },
    { value: 'lowlatency_high_quality', label: 'Low-latency high quality' },
  ];
  if (encoder === 'libx264') return [
    { value: '', label: 'None' }, { value: 'film', label: 'Film' }, { value: 'animation', label: 'Animation' },
    { value: 'grain', label: 'Grain' }, { value: 'stillimage', label: 'Still image' },
    { value: 'fastdecode', label: 'Fast decode' }, { value: 'zerolatency', label: 'Zero latency' },
    { value: 'psnr', label: 'PSNR testing' }, { value: 'ssim', label: 'SSIM testing' },
  ];
  if (encoder === 'libx265') return [
    { value: '', label: 'None' }, { value: 'grain', label: 'Grain' },
    { value: 'fastdecode', label: 'Fast decode' }, { value: 'zerolatency', label: 'Zero latency' },
    { value: 'psnr', label: 'PSNR testing' }, { value: 'ssim', label: 'SSIM testing' },
  ];
  if (encoder.endsWith('_videotoolbox')) return [
    { value: '', label: 'None' }, { value: 'realtime', label: 'Real-time' },
  ];
  return [];
};

export const normalizeEncoderTune = (encoder: string, tune: string) =>
  encoderTuneOptions(encoder).some((option) => option.value === tune) ? tune : '';

export const encoderTuneArguments = (encoder: string, tune: string) => {
  const normalized = normalizeEncoderTune(encoder, tune);
  if (!normalized) return [];
  if (encoder.endsWith('_amf')) return ['-usage', normalized];
  if (encoder.endsWith('_videotoolbox')) return ['-realtime', '1'];
  return ['-tune', normalized];
};
