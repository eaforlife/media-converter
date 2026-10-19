import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseAppConfiguration } from './config.ts';
import { parseIniSections } from './presets.ts';

const configFile = fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8');
const configSections = parseIniSections(configFile);
const configValue = (section: string, key: string) => {
  const value = configSections.get(section)?.get(key);
  assert.notEqual(value, undefined, `[${section}] ${key} should exist in config.ini`);
  return value!;
};

test('loads app defaults from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.equal(configuration.app.name, configValue('App', 'name'));
  assert.equal(configuration.app.updateRepository, configValue('App', 'update_repository'));
  assert.equal(configuration.app.configSourceUrl, configValue('App', 'config_source_url'));
  assert.deepEqual(configuration.mediaExtensions.video, configValue('Media Extensions', 'video').split(','));
  assert.equal(configuration.videoDefaults.outputProfiles['4k'].maxRate,
    Number(configSections.get('Video Output: 4k')?.get('h264_max_rate')));
  assert.deepEqual(configuration.videoDefaults.codecRateMultipliers, {
    hevc: Number(configSections.get('Video Codec Rate Multipliers')?.get('hevc')),
    hevcMain10: Number(configSections.get('Video Codec Rate Multipliers')?.get('hevc_main10')),
    av1: Number(configSections.get('Video Codec Rate Multipliers')?.get('av1')),
    av1TenBit: Number(configSections.get('Video Codec Rate Multipliers')?.get('av1_10bit')),
  });
});

test('requires the remote config source to use HTTPS', () => {
  assert.throws(
    () => parseAppConfiguration(configFile.replace(configValue('App', 'config_source_url'), 'http://example.test/config.ini')),
    /config_source_url must be a valid HTTPS URL/,
  );
});

test('loads app-level audio choices and filters from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.deepEqual(configuration.audioBitrates.opus, configValue('Audio Bitrates', 'opus').split(','));
  assert.doesNotMatch(configFile, /\[Audio Preset:/);
  assert.equal(configuration.audioFilters.downmix51, configValue('Audio Filters', 'downmix_5_1'));
  assert.equal(configuration.musicVideoWorkflow.maxDurationSeconds,
    Number(configValue('Music Video Workflow', 'max_duration_seconds')));
  assert.equal(configuration.musicVideoWorkflow.extractClosedCaptions,
    configValue('Music Video Workflow', 'extract_closed_captions') === '1');
  assert.equal(configuration.videoFilters.cudaTonemap, configValue('Video Filters', 'cuda_tonemap'));
});

test('loads available encoders from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  const configuredEncoders = [...configSections.entries()].filter(([name]) => name.startsWith('Encoder: '));
  assert.equal(configuration.encoders.length, configuredEncoders.length);
  for (const [sectionName, values] of configuredEncoders) {
    const encoder = configuration.encoders.find(({ id }) => id === sectionName.slice('Encoder: '.length));
    assert.ok(encoder, `${sectionName} should be parsed`);
    assert.equal(encoder.label, values.get('label'));
    assert.equal(encoder.vendor, values.get('vendor'));
    assert.equal(encoder.codec, values.get('codec'));
    assert.deepEqual(encoder.platforms, values.get('platforms')?.split(','));
    assert.equal(encoder.main10Enabled, values.get('main10') === '1');
    assert.equal(encoder.highEnabled, values.get('high') === '1');
  }
});

test('loads tagged hardware capability data from the bundled config section', () => {
  const managed = `${configFile}\n[System Capability Cache]\ncache_tag=1\ndriver_version=555.1\nffmpeg_version=8.1.3\nchecked_at=2026-10-19T00:00:00.000Z\ncapabilities_json={"encoders":[],"adapters":[]}\n`;
  assert.equal(parseAppConfiguration(managed).systemCapabilities?.cacheTag, '1');
  assert.equal(parseAppConfiguration(managed).systemCapabilities?.driverVersion, '555.1');
});

test('loads independently tagged personalized defaults from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  const defaults = JSON.parse(Buffer.from(configValue('Personalized Defaults', 'settings_json'), 'base64').toString('utf8'));
  assert.equal(configuration.personalizedDefaults.lastPreset, defaults.lastPreset);
  assert.equal(configuration.personalizedDefaults.hardwareAcceleration, defaults.hardwareAcceleration);
  assert.equal(configuration.personalizedDefaults.workingPreset, defaults.workingPreset);
  assert.throws(
    () => parseAppConfiguration(configFile.replace('defaults_tag=1', 'defaults_tag=2')),
    /defaults_tag must be 1/,
  );
});
