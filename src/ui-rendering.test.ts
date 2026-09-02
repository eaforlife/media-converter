import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {
  shouldDisableUiHardwareAcceleration, shouldInvalidateUiAfterInputType, uiRenderingCommandLineSwitches,
} from './ui-rendering.ts';

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

test('toggle state changes do not animate compositor layers', () => {
  const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const track = /[.]toggle-row i \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const thumb = /[.]toggle-row i::after \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.notEqual(track, '');
  assert.notEqual(thumb, '');
  assert.doesNotMatch(track, /transition|animation/);
  assert.doesNotMatch(thumb, /transition|animation/);
});

test('checkbox and radio state changes request a complete repaint', () => {
  assert.equal(shouldInvalidateUiAfterInputType('checkbox'), true);
  assert.equal(shouldInvalidateUiAfterInputType('radio'), true);
  assert.equal(shouldInvalidateUiAfterInputType('range'), false);
  assert.equal(shouldInvalidateUiAfterInputType('number'), false);
});

test('hidden toggle inputs do not create transparent compositor layers', () => {
  const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const input = /[.]toggle-row input \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.notEqual(input, '');
  assert.doesNotMatch(input, /opacity/);
});
