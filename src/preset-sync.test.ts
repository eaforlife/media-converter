import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseAppConfiguration } from './config.ts';
import { compareIniVersions, iniVersion, sourceIniIsNewer } from './ini-version.ts';
import { parseBuiltInPresetConfiguration, parseIniSections } from './presets.ts';
import { presetContentsMatch, synchronizePresetFile, validateRemotePresetContents } from './preset-sync.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');
const changedPreset = presetFile.replace('[Archive]', '[Archive]\n; stale local variant');
const configFile = fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8');
const presetSections = parseIniSections(presetFile);
const presetValue = (key: string) => {
  const value = presetSections.get('Music Video')?.get(key);
  assert.notEqual(value, undefined, `[Music Video] ${key} should exist in presets.ini`);
  return value!;
};

test('downloads predefined defaults from presets.ini on the main repository branch', () => {
  assert.equal(
    parseAppConfiguration(configFile).app.presetSourceUrl,
    parseIniSections(configFile).get('App')?.get('preset_source_url'),
  );
});

test('compares preset contents independently of BOM and platform line endings', () => {
  assert.equal(presetContentsMatch(presetFile, `\uFEFF${presetFile.replace(/\n/g, '\r\n')}`), true);
  assert.equal(presetContentsMatch(presetFile, changedPreset), false);
});

test('presets inherit app rates unless a tier override is specified and preserve workflow defaults', () => {
  const { presets } = parseBuiltInPresetConfiguration(presetFile);
  const config = parseAppConfiguration(configFile);
  for (const tier of ['4k', '1080p', '720p', '360p'] as const) {
    assert.equal(config.videoDefaults.outputProfiles[tier].maxRate > 0, true);
  }
  assert.ok(presets['Music Video'].quality.nvenc);
  assert.equal(presets['Music Video'].audioCodec, presetValue('audio_codec'));
  assert.equal(presets['Music Video'].audioRates.opus.stereo, presetValue('audio_opus_stereo'));
  assert.equal(presets['Music Video'].defaultMain10, ['1', 'true'].includes(presetValue('default_main10')));
  assert.equal(presets['Music Video'].advancedVideo.spatialAq, Number(presetValue('spatial_aq')));
  assert.equal(presets['Music Video'].advancedVideo.bFrames, ['1', 'true'].includes(presetValue('b_frames')));
});

test('INI version tags normalize minor-only versions and only replace older local data', () => {
  assert.equal(iniVersion('[Version: 2.9]\n'), '2.9.0');
  assert.equal(iniVersion(configFile), null);
  assert.match(configFile, /^\[App Version: \d+\.\d+\.\d+\]/);
  assert.equal(compareIniVersions('2.10.0', '2.9.9'), 1);
  assert.equal(compareIniVersions('2.9.0', '2.9'), 0);
  assert.equal(sourceIniIsNewer('[Version: 2.9.0]\n', '[Version: 2.8.7]\n'), true);
  assert.equal(sourceIniIsNewer('[Version: 2.9.0]\n', '[Version: 3.0.0]\n'), false);
  assert.equal(sourceIniIsNewer('[Version: 2.9.0]\n', '[Version: deadbee]\n'), true);
});

test('validates a remote preset before atomically replacing the local file', async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-preset-sync-'));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'presets.ini');
  await fs.promises.writeFile(target, changedPreset, 'utf8');

  assert.equal(await synchronizePresetFile(target, presetFile), true);
  assert.equal(await fs.promises.readFile(target, 'utf8'), presetFile);
  assert.equal(await synchronizePresetFile(target, `\uFEFF${presetFile.replace(/\n/g, '\r\n')}`), false);

  const invalid = presetFile.replace(/rc_lookahead=\d+/, 'rc_lookahead=99');
  assert.throws(() => validateRemotePresetContents(invalid), /rc_lookahead must be an integer/);
  await assert.rejects(() => synchronizePresetFile(target, invalid), /rc_lookahead must be an integer/);
  assert.equal(await fs.promises.readFile(target, 'utf8'), presetFile);
});
