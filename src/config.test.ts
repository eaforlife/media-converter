import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseAppConfiguration } from './config.ts';

const configFile = fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8');

test('loads app defaults from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.equal(configuration.app.name, 'EA Media Tools');
  assert.equal(configuration.app.updateRepository, 'eaforlife/media-converter');
  assert.equal(configuration.app.configSourceUrl, 'https://raw.githubusercontent.com/eaforlife/media-converter/main/config.ini');
  assert.deepEqual(configuration.mediaExtensions.video.slice(0, 3), ['mp4', 'mkv', 'mov']);
});

test('requires the remote config source to use HTTPS', () => {
  assert.throws(
    () => parseAppConfiguration(configFile.replace('https://raw.githubusercontent.com/eaforlife/media-converter/main/config.ini', 'http://example.test/config.ini')),
    /config_source_url must be a valid HTTPS URL/,
  );
});

test('loads app-level audio choices and filters from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.deepEqual(configuration.audioBitrates.opus, ['32k', '48k', '64k', '80k', '96k', '112k', '128k']);
  assert.doesNotMatch(configFile, /\[Audio Preset:/);
  assert.equal(configuration.audioFilters.downmix51.includes('pan=stereo'), true);
  assert.equal(configuration.musicVideoWorkflow.maxDurationSeconds, 480);
  assert.equal(configuration.musicVideoWorkflow.extractClosedCaptions, true);
  assert.equal(configuration.videoFilters.cudaTonemap.includes('tonemap_cuda'), true);
});

test('loads available encoders from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.ok(configuration.encoders.some((encoder) =>
    encoder.id === 'hevc_nvenc' && encoder.main10Enabled && !encoder.highEnabled && encoder.platforms?.includes('win32')));
  assert.ok(configuration.encoders.some((encoder) =>
    encoder.id === 'av1_nvenc' && encoder.main10Enabled && !encoder.highEnabled));
  assert.ok(configuration.encoders.some((encoder) =>
    encoder.id === 'h264_nvenc' && !encoder.main10Enabled && encoder.highEnabled));
});

test('loads tagged hardware capability data from the bundled config section', () => {
  const managed = `${configFile}\n[System Capability Cache]\ncache_tag=1\ndriver_version=555.1\nffmpeg_version=8.1.3\nchecked_at=2026-10-19T00:00:00.000Z\ncapabilities_json={"encoders":[],"adapters":[]}\n`;
  assert.equal(parseAppConfiguration(managed).systemCapabilities?.cacheTag, '1');
  assert.equal(parseAppConfiguration(managed).systemCapabilities?.driverVersion, '555.1');
});

test('loads independently tagged personalized defaults from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.equal(configuration.personalizedDefaults.lastPreset, 'Streaming');
  assert.equal(configuration.personalizedDefaults.hardwareAcceleration, true);
  assert.equal(configuration.personalizedDefaults.workingPreset, null);
  assert.throws(
    () => parseAppConfiguration(configFile.replace('defaults_tag=1', 'defaults_tag=2')),
    /defaults_tag must be 1/,
  );
});
