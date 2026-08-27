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

export const strictVideoTranscodeArguments = () => [
  '-max_error_rate', '0',
  '-abort_on', 'empty_output+empty_output_stream',
];
