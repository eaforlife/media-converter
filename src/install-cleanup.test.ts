import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupPreviousInstall, INSTALL_CLEANUP_RETRIES, obsoleteInstallDirectoryNames,
  obsoleteRuntimeLogNames, runtimeLogNeedsReset,
} from './install-cleanup.ts';

test('update cleanup selects only obsolete Squirrel version directories', () => {
  assert.deepEqual(obsoleteInstallDirectoryNames([
    'app-1.0.0', 'app-1.1.0', 'app-1.2.0', 'APP-1.2.0', 'app-2.0.0-beta.1', 'app-2-staging',
    'packages', 'user-config', 'app-backup',
  ], 'app-1.2.0'), ['app-1.0.0', 'app-1.1.0', 'app-2.0.0-beta.1', 'app-2-staging']);
  assert.equal(INSTALL_CLEANUP_RETRIES, 10);
});

test('startup cleanup recursively removes partial old installs and preserves the current version', async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-install-cleanup-'));
  const current = path.join(root, 'app-2.6.2');
  const old = path.join(root, 'app-2.6.1');
  const unrelated = path.join(root, 'app-backup');
  try {
    await Promise.all([
      fs.promises.mkdir(path.join(current, 'resources'), { recursive: true }),
      fs.promises.mkdir(path.join(old, 'resources'), { recursive: true }),
      fs.promises.mkdir(unrelated, { recursive: true }),
    ]);
    await Promise.all([
      fs.promises.writeFile(path.join(current, 'resources', 'app.asar'), 'current'),
      fs.promises.writeFile(path.join(old, 'resources', 'app.asar'), 'obsolete'),
    ]);

    await cleanupPreviousInstall(current);

    assert.equal(fs.existsSync(current), true);
    assert.equal(fs.existsSync(path.join(current, 'resources', 'app.asar')), true);
    assert.equal(fs.existsSync(old), false);
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
