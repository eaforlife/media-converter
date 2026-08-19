import { equal, rejects } from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, test } from 'node:test';
import { replaceSourceWithMetadataOutput } from './metadata-replacement.ts';

const temporaryDirectories: string[] = [];
afterEach(async () => {
  await Promise.all(temporaryDirectories.splice(0).map((directory) =>
    fs.promises.rm(directory, { recursive: true, force: true })));
});

test('metadata replacement installs the staged file and removes the original', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-metadata-test-'));
  temporaryDirectories.push(directory);
  const source = path.join(directory, 'episode.mkv');
  const staged = path.join(directory, 'episode_tmp00.mkv');
  await fs.promises.writeFile(source, 'original');
  await fs.promises.writeFile(staged, 'updated');

  const result = await replaceSourceWithMetadataOutput(source, staged);
  equal(await fs.promises.readFile(source, 'utf8'), 'updated');
  equal(fs.existsSync(staged), false);
  equal(result.backupPath, null);
});

test('metadata replacement restores the source if the staged output is unavailable', async () => {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-metadata-test-'));
  temporaryDirectories.push(directory);
  const source = path.join(directory, 'episode.mkv');
  const missing = path.join(directory, 'episode_tmp00.mkv');
  await fs.promises.writeFile(source, 'original');

  await rejects(() => replaceSourceWithMetadataOutput(source, missing), /does not exist/);
  equal(await fs.promises.readFile(source, 'utf8'), 'original');
});
