import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { DEFAULT_CONFIG_INI, parseAppConfiguration } from './config.ts';

const configFile = fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8');

test('loads app defaults from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.equal(configuration.app.name, 'EA Media Tools');
  assert.equal(configuration.app.updateRepository, 'eaforlife/media-converter');
  assert.deepEqual(configuration.mediaExtensions.video.slice(0, 3), ['mp4', 'mkv', 'mov']);
});

test('loads audio filters and presets from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.equal(configuration.audioPresets.Streaming.codec, 'libopus');
  assert.equal(configuration.audioPresets.Archive.downmixBitrate, '256k');
  assert.equal(configuration.audioFilters.downmix51.includes('pan=stereo'), true);
  assert.equal(configuration.videoFilters.cudaTonemap.includes('tonemap_cuda'), true);
});

test('loads available encoders from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.ok(configuration.encoders.some((encoder) =>
    encoder.id === 'hevc_nvenc' && encoder.tenBitTest && encoder.platforms?.includes('win32')));
  assert.ok(configuration.encoders.some((encoder) =>
    encoder.id === 'av1_videotoolbox' && encoder.vendor === 'Apple'));
});

test('embedded fallback config matches the checked-in config.ini', () => {
  assert.deepEqual(parseAppConfiguration(DEFAULT_CONFIG_INI), parseAppConfiguration(configFile));
});
