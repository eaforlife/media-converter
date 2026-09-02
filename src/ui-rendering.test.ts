import assert from 'node:assert/strict';
import test from 'node:test';
import { shouldDisableUiHardwareAcceleration, uiRenderingCommandLineSwitches } from './ui-rendering.ts';

test('uses software UI rendering on Windows without affecting FFmpeg hardware acceleration', () => {
  assert.equal(shouldDisableUiHardwareAcceleration('win32'), true);
});

test('leaves Electron UI hardware acceleration enabled on other platforms', () => {
  assert.equal(shouldDisableUiHardwareAcceleration('darwin'), false);
  assert.equal(shouldDisableUiHardwareAcceleration('linux'), false);
});

test('disables the Windows GPU compositor and DirectComposition surface path', () => {
  assert.deepEqual(uiRenderingCommandLineSwitches('win32'), [
    'disable-gpu-compositing',
    'disable-direct-composition',
  ]);
});

test('does not add Windows compositor switches on other platforms', () => {
  assert.deepEqual(uiRenderingCommandLineSwitches('darwin'), []);
  assert.deepEqual(uiRenderingCommandLineSwitches('linux'), []);
});
