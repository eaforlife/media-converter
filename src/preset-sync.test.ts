import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { PRESET_SOURCE_URL } from './config.ts';
import { presetContentsMatch, synchronizePresetFile, validateRemotePresetContents } from './preset-sync.ts';

const presetFile = fs.readFileSync(new URL('../presets.ini', import.meta.url), 'utf8');

test('downloads predefined defaults from presets.ini on the main repository branch', () => {
  assert.equal(
    PRESET_SOURCE_URL,
    'https://raw.githubusercontent.com/eaforlife/media-converter/main/presets.ini',
  );
});

test('compares preset contents independently of BOM and platform line endings', () => {
  assert.equal(presetContentsMatch(presetFile, `\uFEFF${presetFile.replace(/\n/g, '\r\n')}`), true);
  assert.equal(presetContentsMatch(presetFile, presetFile.replace('quality_nvenc_4k=31', 'quality_nvenc_4k=30')), false);
});

test('validates a remote preset before atomically replacing the local file', async (context) => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-preset-sync-'));
  context.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  const target = path.join(directory, 'presets.ini');
  const oldPreset = presetFile.replace('quality_nvenc_4k=31', 'quality_nvenc_4k=30');
  await fs.promises.writeFile(target, oldPreset, 'utf8');

  assert.equal(await synchronizePresetFile(target, presetFile), true);
  assert.equal(await fs.promises.readFile(target, 'utf8'), presetFile);
  assert.equal(await synchronizePresetFile(target, `\uFEFF${presetFile.replace(/\n/g, '\r\n')}`), false);

  const invalid = presetFile.replace('rc_lookahead=26', 'rc_lookahead=99');
  assert.throws(() => validateRemotePresetContents(invalid), /rc_lookahead must be an integer/);
  await assert.rejects(() => synchronizePresetFile(target, invalid), /rc_lookahead must be an integer/);
  assert.equal(await fs.promises.readFile(target, 'utf8'), presetFile);
});
