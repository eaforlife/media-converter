import assert from 'node:assert/strict';
import test from 'node:test';
import {
  cudaCropBridgeFilters, cudaHardwareDecodeArguments, cuvidDecoderCropArguments, cuvidDecoderName,
  EXTRA_HARDWARE_DECODE_FRAMES, hardwareUploadFilter,
  protectedHardwareDecodeArguments, strictVideoTranscodeArguments,
} from './video-safety.ts';

test('uses expanded decoder and filter pools without unsafe hardware output', () => {
  assert.equal(EXTRA_HARDWARE_DECODE_FRAMES, '64');
  assert.deepEqual(protectedHardwareDecodeArguments(), ['-extra_hw_frames', '64']);
  assert.equal(hardwareUploadFilter(), 'hwupload=extra_hw_frames=64');
  assert.ok(!protectedHardwareDecodeArguments().includes('unsafe_output'));
});

test('bridges an auto-crop back to CUDA without disabling NVDEC', () => {
  assert.deepEqual(cudaCropBridgeFilters('1920:800:0:140', false), [
    'hwdownload', 'format=nv12', 'crop=1920:800:0:140', 'hwupload=extra_hw_frames=64',
  ]);
  assert.equal(cudaCropBridgeFilters('3840:1600:0:280', true)[1], 'format=p010le');
});

test('uses zero-copy decoder crop only when the matching CUVID decoder is available', () => {
  assert.deepEqual(
    cuvidDecoderCropArguments('h264_cuvid', '140x140x0x0', ['h264_cuvid', 'hevc_cuvid']),
    ['-c:v:0', 'h264_cuvid', '-crop', '140x140x0x0'],
  );
  assert.deepEqual(cuvidDecoderCropArguments('av1_cuvid', '0x280x0x0', ['h264_cuvid']), []);
});

test('maps every CUVID video format exposed by Jellyfin FFmpeg', () => {
  assert.deepEqual(
    ['AV1', 'H264', 'HEVC', 'MJPEG', 'MPEG1VIDEO', 'MPEG2VIDEO', 'MPEG4', 'VC1', 'VP8', 'VP9']
      .map(cuvidDecoderName),
    ['av1_cuvid', 'h264_cuvid', 'hevc_cuvid', 'mjpeg_cuvid', 'mpeg1_cuvid', 'mpeg2_cuvid',
      'mpeg4_cuvid', 'vc1_cuvid', 'vp8_cuvid', 'vp9_cuvid'],
  );
  assert.equal(cuvidDecoderName('H.264'), 'h264_cuvid');
  assert.equal(cuvidDecoderName('prores'), null);
});

test('uses protected generic NVDEC only when decoder-side crop is unavailable', () => {
  const zeroCopy = cudaHardwareDecodeArguments(['-c:v:0', 'h264_cuvid', '-crop', '140x140x0x0']);
  assert.ok(zeroCopy.includes('h264_cuvid'));
  assert.equal(zeroCopy.includes('-extra_hw_frames'), false);

  const fallback = cudaHardwareDecodeArguments([]);
  assert.ok(fallback.includes('-hwaccel_output_format'));
  assert.deepEqual(fallback.slice(-2), ['-extra_hw_frames', '64']);
});

test('makes logged decode errors and empty video outputs fail closed', () => {
  assert.deepEqual(strictVideoTranscodeArguments(), [
    '-max_error_rate', '0',
    '-abort_on', 'empty_output+empty_output_stream',
  ]);
});
