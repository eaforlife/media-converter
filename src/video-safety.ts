export const EXTRA_HARDWARE_DECODE_FRAMES = '64';

export const protectedHardwareDecodeArguments = () => [
  '-extra_hw_frames', EXTRA_HARDWARE_DECODE_FRAMES,
];

export const hardwareUploadFilter = () => `hwupload=extra_hw_frames=${EXTRA_HARDWARE_DECODE_FRAMES}`;

export const cudaCropBridgeFilters = (crop: string, tenBit: boolean) => [
  'hwdownload',
  `format=${tenBit ? 'p010le' : 'nv12'}`,
  `crop=${crop}`,
  hardwareUploadFilter(),
];

const CUVID_DECODER_BY_CODEC: Readonly<Record<string, string>> = {
  AV1: 'av1_cuvid',
  AVC: 'h264_cuvid',
  H264: 'h264_cuvid',
  H265: 'hevc_cuvid',
  HEVC: 'hevc_cuvid',
  MJPEG: 'mjpeg_cuvid',
  MPEG1: 'mpeg1_cuvid',
  MPEG1VIDEO: 'mpeg1_cuvid',
  MPEG2: 'mpeg2_cuvid',
  MPEG2VIDEO: 'mpeg2_cuvid',
  MPEG4: 'mpeg4_cuvid',
  VC1: 'vc1_cuvid',
  VP8: 'vp8_cuvid',
  VP9: 'vp9_cuvid',
};

export const cuvidDecoderName = (codec: string | null | undefined) =>
  CUVID_DECODER_BY_CODEC[codec?.trim().toUpperCase().replaceAll('.', '') ?? ''] ?? null;

export const cuvidDecoderCropArguments = (
  decoder: string | null,
  margins: string | null,
  availableDecoders: readonly string[],
) => decoder && margins && availableDecoders.includes(decoder)
  ? ['-c:v:0', decoder, '-crop', margins]
  : [];

export const cudaHardwareDecodeArguments = (decoderCropArguments: readonly string[]) => [
  '-init_hw_device', 'cuda=cu:0', '-filter_hw_device', 'cu', '-hwaccel', 'cuda',
  '-hwaccel_output_format', 'cuda',
  ...(decoderCropArguments.length > 0 ? decoderCropArguments : protectedHardwareDecodeArguments()),
];

export const strictVideoTranscodeArguments = () => [
  '-max_error_rate', '0',
  '-abort_on', 'empty_output+empty_output_stream',
];
