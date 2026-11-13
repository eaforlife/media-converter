import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { parseAppConfiguration } from './config.ts';
import { multichannelAacBitrateOptions } from './audio-bitrate.ts';
import { parseIniSections } from './presets.ts';

const configFile = fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8');
const configSections = parseIniSections(configFile);
const appPackage = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };
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
  assert.equal(configuration.videoDefaults.main10Advanced.streamingSpatialAq,
    Number(configSections.get('Main10 Defaults')?.get('streaming_spatial_aq')));
  assert.equal(configuration.videoDefaults.main10Advanced.spatialAq, 8);
  assert.equal(configuration.videoDefaults.main10Advanced.bFrames, true);
  assert.equal(configuration.videoDefaults.main10, configValue('UI Defaults', 'default_main10') === '1');
  assert.equal(configuration.jobBehaviorDefaults.stripMetadata, true);
  assert.equal(configuration.videoDefaults.outputProfiles['4k'].scale[0], '2900');
  assert.equal(configuration.videoDefaults.outputProfiles['1080p'].scale[0], '1890');
  assert.deepEqual(configuration.jobBehaviorDefaults, {
    remuxAudio: configValue('Job Behavior Defaults', 'remux_audio') === '1',
    remuxSubtitles: configValue('Job Behavior Defaults', 'remux_subtitles') === '1',
    stripMetadata: configValue('Job Behavior Defaults', 'strip_metadata') === '1',
    doNotReplaceAudio: configValue('Job Behavior Defaults', 'do_not_replace_audio') === '1',
    downmixToStereo: configValue('Job Behavior Defaults', 'downmix_to_stereo') === '1',
  });
  assert.deepEqual(configuration.videoDefaults.codecRateMultipliers, {
    hevc: Number(configSections.get('Video Codec Rate Multipliers')?.get('hevc')),
    hevcMain10: Number(configSections.get('Video Codec Rate Multipliers')?.get('hevc_main10')),
    av1: Number(configSections.get('Video Codec Rate Multipliers')?.get('av1')),
    av1TenBit: Number(configSections.get('Video Codec Rate Multipliers')?.get('av1_10bit')),
  });
  assert.equal(configuration.encodeConcurrency.minimumFpsPerJob,
    Number(configSections.get('Encode Concurrency')?.get('minimum_fps_per_job')));
});

test('disables concurrent encoding when the FPS setting is missing or zero', () => {
  const withoutConcurrency = configFile.replace(/\n\[Encode Concurrency\]\nminimum_fps_per_job=\d+\n/, '\n');
  assert.equal(parseAppConfiguration(withoutConcurrency).encodeConcurrency.minimumFpsPerJob, 0);
  assert.equal(parseAppConfiguration(configFile.replace('minimum_fps_per_job=300', 'minimum_fps_per_job=0'))
    .encodeConcurrency.minimumFpsPerJob, 0);
});

test('requires the remote config source to use HTTPS', () => {
  assert.throws(
    () => parseAppConfiguration(configFile.replace(configValue('App', 'config_source_url'), 'http://example.test/config.ini')),
    /config_source_url must be a valid HTTPS URL/,
  );
});

test('requires every job behavior default in config.ini', () => {
  assert.throws(() => parseAppConfiguration(configFile.replace(/\n\[Job Behavior Defaults\][\s\S]*?(?=\n\[)/, '\n')),
    /config.ini is missing the \[Job Behavior Defaults\] section/);
  assert.throws(() => parseAppConfiguration(configFile.replace('remux_audio=1\n', '')),
    /\[Job Behavior Defaults\] is missing remux_audio/);
});

test('loads app-level audio choices and filters from config.ini', () => {
  const configuration = parseAppConfiguration(configFile);
  assert.deepEqual(configuration.audioBitrates.aac, configValue('Audio Bitrates', 'aac').split(','));
  assert.deepEqual(configuration.audioBitrates.aacMultichannelBase,
    configValue('Audio Bitrates', 'aac_multichannel_base').split(','));
  assert.deepEqual(configuration.audioBitrates.opus, configValue('Audio Bitrates', 'opus').split(','));
  assert.doesNotMatch(configFile, /\[Audio Preset:/);
  assert.equal(configuration.audioFilters.downmix51, configValue('Audio Filters', 'downmix_5_1'));
  assert.equal(configuration.musicVideoWorkflow.maxDurationSeconds,
    Number(configValue('Music Video Workflow', 'max_duration_seconds')));
  assert.equal(configuration.musicVideoWorkflow.extractClosedCaptions,
    configValue('Music Video Workflow', 'extract_closed_captions') === '1');
  assert.equal(configuration.videoFilters.cudaTonemap, configValue('Video Filters', 'cuda_tonemap'));
});

test('rejects malformed configured audio bitrate choices', () => {
  assert.throws(() => parseAppConfiguration(configFile.replace('aac_multichannel_base=32k,', 'aac_multichannel_base=bad,')),
    /\[Audio Bitrates\] aac_multichannel_base must be a comma-separated list of positive kbit\/s values/);
});

test('configured AAC bitrate range scales to the expected six- and eight-channel limits', () => {
  const configured = parseAppConfiguration(configFile).audioBitrates.aacMultichannelBase;
  const sixChannel = multichannelAacBitrateOptions(configured, 6);
  const eightChannel = multichannelAacBitrateOptions(configured, 8);
  assert.deepEqual([sixChannel[0], sixChannel.at(-1)], ['96k', '768k']);
  assert.deepEqual([eightChannel[0], eightChannel.at(-1)], ['128k', '1024k']);
});

test('urgent update policy requires the packaged release version', () => {
  const policy = fs.readFileSync(new URL('../updatepolicy', import.meta.url), 'utf8');
  assert.match(policy, /^urgentUpdate=1$/m);
  assert.match(policy, new RegExp(`^minVersion=${appPackage.version.replaceAll('.', '\\.')}$`, 'm'));
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
