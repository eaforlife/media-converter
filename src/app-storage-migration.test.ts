import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { migrateCustomPresetFile, removeLegacyDataDirectories } from './app-storage-migration.ts';

const customPreset = `[Test]\nformat=mp4\nencoder=libx265\nencoder_speed=4\nquality=20\nvideo_bitrate=0\nmax_rate=0\nbuffer_multiplier=1\nbuffer_size=0\ndelivery_mode=0\naudio_codec=libfdk_aac\naudio_bitrate=192k\n`;

test('migrates custom presets from the prior app bundle before legacy data', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-storage-migration-'));
  const current = path.join(root, 'app-2.9.3', 'resources');
  const prior = path.join(root, 'app-2.9.2', 'resources');
  const legacy = path.join(root, 'Roaming', 'EA Media Tools');
  await fs.promises.mkdir(prior, { recursive: true });
  await fs.promises.mkdir(legacy, { recursive: true });
  await fs.promises.writeFile(path.join(prior, 'custom_preset.ini'), customPreset);
  await fs.promises.writeFile(path.join(legacy, 'custom_preset.ini'), '[Invalid]\nformat=unknown\n');
  try {
    const result = await migrateCustomPresetFile(current, [prior], [legacy]);
    assert.equal(result.safeToCleanPrevious, true);
    assert.equal(result.copiedFrom, path.join(prior, 'custom_preset.ini'));
    assert.equal(await fs.promises.readFile(path.join(current, 'custom_preset.ini'), 'utf8'), customPreset);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('does not authorize cleanup when existing custom presets cannot be read', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-storage-migration-'));
  const prior = path.join(root, 'app-2.9.2', 'resources');
  await fs.promises.mkdir(prior, { recursive: true });
  await fs.promises.writeFile(path.join(prior, 'custom_preset.ini'), '[Invalid]\nformat=unknown\n');
  try {
    const result = await migrateCustomPresetFile(path.join(root, 'current'), [prior], []);
    assert.equal(result.safeToCleanPrevious, false);
    assert.equal(fs.existsSync(path.join(prior, 'custom_preset.ini')), true);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('removes exact legacy directories but preserves an active install ancestor', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-storage-cleanup-'));
  const activeInstall = path.join(root, 'ea_media_tools', 'app-2.9.3');
  const legacy = path.join(root, 'EA Media Tools');
  await fs.promises.mkdir(activeInstall, { recursive: true });
  await fs.promises.mkdir(legacy, { recursive: true });
  try {
    const result = await removeLegacyDataDirectories([path.dirname(activeInstall), legacy], activeInstall);
    assert.deepEqual(result.removed, [legacy]);
    assert.deepEqual(result.preserved, [path.dirname(activeInstall)]);
    assert.equal(fs.existsSync(activeInstall), true);
    assert.equal(fs.existsSync(legacy), false);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});
