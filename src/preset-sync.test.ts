import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { parseAppConfiguration } from './config.ts';
import { compareIniVersions, iniVersion, sourceIniIsNewer } from './ini-version.ts';
import { presetContentsMatch, synchronizePresetFile, validateRemotePresetContents } from './preset-sync.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');
const changedPreset = presetFile.replace('[Archive]', '[Archive]\n; stale local variant');
const configFile = fs.readFileSync(new URL('../config.ini', import.meta.url), 'utf8');

test('downloads predefined defaults from presets.ini on the main repository branch', () => {
  assert.equal(
    parseAppConfiguration(configFile).app.presetSourceUrl,
    'https://raw.githubusercontent.com/eaforlife/media-converter/main/presets.ini',
  );
});

test('compares preset contents independently of BOM and platform line endings', () => {
  assert.equal(presetContentsMatch(presetFile, `\uFEFF${presetFile.replace(/\n/g, '\r\n')}`), true);
  assert.equal(presetContentsMatch(presetFile, changedPreset), false);
});

test('INI version tags normalize minor-only versions and only replace older local data', () => {
  assert.equal(iniVersion('[Version: 2.9]\n'), '2.9.0');
  assert.equal(iniVersion(configFile), '2.9.0');
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

  const invalid = presetFile.replace('rc_lookahead=26', 'rc_lookahead=99');
  assert.throws(() => validateRemotePresetContents(invalid), /rc_lookahead must be an integer/);
  await assert.rejects(() => synchronizePresetFile(target, invalid), /rc_lookahead must be an integer/);
  assert.equal(await fs.promises.readFile(target, 'utf8'), presetFile);
});
