import assert from 'node:assert/strict';
import fs from 'node:fs';
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

test('toggle state changes do not animate compositor layers', () => {
  const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const track = /[.]toggle-row > i \{([^}]*)\}/.exec(css)?.[1] ?? '';
  const thumb = /[.]toggle-row > i::after \{([^}]*)\}/.exec(css)?.[1] ?? '';
  assert.notEqual(track, '');
  assert.notEqual(thumb, '');
  assert.doesNotMatch(track, /transition|animation/);
  assert.doesNotMatch(thumb, /transition|animation/);
});

test('custom switches have no native checkbox state or repaint IPC', () => {
  const css = fs.readFileSync(new URL('./index.css', import.meta.url), 'utf8');
  const renderer = fs.readFileSync(new URL('./renderer.ts', import.meta.url), 'utf8');
  const preload = fs.readFileSync(new URL('./preload.ts', import.meta.url), 'utf8');
  const main = fs.readFileSync(new URL('./main.ts', import.meta.url), 'utf8');
  assert.doesNotMatch(renderer, /<label class="toggle-row/);
  assert.doesNotMatch(renderer, /window[.]mediaAPI[.]invalidateWindow/);
  assert.doesNotMatch(preload, /window:invalidate/);
  assert.doesNotMatch(main, /window:invalidate/);
  assert.doesNotMatch(css, /[.]toggle-row input/);
  assert.match(renderer, /class="toggle-row advanced-toggle" role="switch" data-advanced-toggle/);
});
