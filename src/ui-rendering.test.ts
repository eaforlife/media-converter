import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldDisableUiHardwareAcceleration } from './ui-rendering.ts';

test('uses software UI rendering on Windows without affecting FFmpeg hardware acceleration', () => {
  assert.equal(shouldDisableUiHardwareAcceleration('win32'), true);
});

test('leaves Electron UI hardware acceleration enabled on other platforms', () => {
  assert.equal(shouldDisableUiHardwareAcceleration('darwin'), false);
  assert.equal(shouldDisableUiHardwareAcceleration('linux'), false);
});
