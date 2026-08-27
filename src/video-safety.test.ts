import assert from 'node:assert/strict';
import test from 'node:test';
import {
  EXTRA_HARDWARE_DECODE_FRAMES, hardwareUploadFilter,
  protectedHardwareDecodeArguments, strictVideoTranscodeArguments,
} from './video-safety.ts';

test('uses expanded decoder and filter pools without unsafe hardware output', () => {
  assert.equal(EXTRA_HARDWARE_DECODE_FRAMES, '64');
  assert.deepEqual(protectedHardwareDecodeArguments(), ['-extra_hw_frames', '64']);
  assert.equal(hardwareUploadFilter(), 'hwupload=extra_hw_frames=64');
  assert.ok(!protectedHardwareDecodeArguments().includes('unsafe_output'));
});

test('makes logged decode errors and empty video outputs fail closed', () => {
  assert.deepEqual(strictVideoTranscodeArguments(), [
    '-max_error_rate', '0',
    '-abort_on', 'empty_output+empty_output_stream',
  ]);
});
