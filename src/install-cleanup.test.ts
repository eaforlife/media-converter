import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupPreviousInstall, INSTALL_CLEANUP_RETRIES, INSTALL_CLEANUP_RETRY_DELAY_MS, obsoleteInstallDirectoryNames,
  obsoleteRuntimeLogNames, runtimeLogNeedsReset,
} from './install-cleanup.ts';

test('update cleanup selects only Squirrel versions older than the running app', () => {
  assert.deepEqual(obsoleteInstallDirectoryNames([
    'app-2.6.1', 'app-2.6.2', 'app-2.6.3-beta.1', 'app-2.6.3', 'APP-2.6.3',
    'app-2.6.4', 'app-3-staging', 'app-not-a-version-1',
    'packages', 'user-config', 'app-backup',
  ], 'app-2.6.3'), ['app-2.6.1', 'app-2.6.2', 'app-2.6.3-beta.1']);
  assert.equal(INSTALL_CLEANUP_RETRIES, 2);
  assert.equal(INSTALL_CLEANUP_RETRY_DELAY_MS, 100);
});

test('startup cleanup reports visible progress before deleting old installs and preserves newer versions', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-install-cleanup-'));
  const current = path.join(root, 'app-2.6.3');
  const old = path.join(root, 'app-2.6.2');
  const newer = path.join(root, 'app-2.6.4');
  const legacyLibrary = path.join(root, 'lib');
  const unrelated = path.join(root, 'app-backup');
  const progress: string[] = [];
  try {
    await Promise.all([
      fs.promises.mkdir(path.join(current, 'resources'), { recursive: true }),
      fs.promises.mkdir(path.join(old, 'resources'), { recursive: true }),
      fs.promises.mkdir(path.join(newer, 'resources'), { recursive: true }),
      fs.promises.mkdir(legacyLibrary, { recursive: true }),
      fs.promises.mkdir(unrelated, { recursive: true }),
    ]);
    await Promise.all([
      fs.promises.writeFile(path.join(current, 'resources', 'app.asar'), 'current'),
      fs.promises.writeFile(path.join(old, 'resources', 'app.asar'), 'obsolete'),
      fs.promises.writeFile(path.join(newer, 'resources', 'app.asar'), 'staged'),
      fs.promises.writeFile(path.join(legacyLibrary, 'runtime.dll'), 'legacy'),
    ]);

    await cleanupPreviousInstall(current, ({ name }) => {
      assert.equal(fs.existsSync(path.join(root, name)), true);
      progress.push(name);
    });

    assert.deepEqual(progress, ['app-2.6.2', 'lib']);
    assert.equal(fs.existsSync(current), true);
    assert.equal(fs.existsSync(path.join(current, 'resources', 'app.asar')), true);
    assert.equal(fs.existsSync(old), false);
    assert.equal(fs.existsSync(newer), true);
    assert.equal(fs.existsSync(path.join(newer, 'resources', 'app.asar')), true);
    assert.equal(fs.existsSync(legacyLibrary), false);
    assert.equal(fs.existsSync(unrelated), true);
  } finally {
    await fs.promises.rm(root, { recursive: true, force: true });
  }
});

test('update cleanup selects archived runtime logs only', () => {
  assert.deepEqual(obsoleteRuntimeLogNames([
    'app.log', 'app.log.1', 'app.log.2', 'app_old20260826010101.log', 'config', 'notes.log',
  ]), ['app.log.1', 'app.log.2', 'app_old20260826010101.log']);
});

test('runtime logs reset when their latest start belongs to an older version', () => {
  const oldLog = '2026-08-25T00:00:00.000Z [INFO] application.started {"version":"2.0.0","packaged":true}\n';
  assert.equal(runtimeLogNeedsReset(oldLog, '2.0.1'), true);
  assert.equal(runtimeLogNeedsReset(oldLog, '2.0.0'), false);
  assert.equal(runtimeLogNeedsReset('unstructured prior output', '2.0.1'), false);
});
