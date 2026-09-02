import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  cleanupPreviousInstall, DEFERRED_CLEANUP_ATTEMPTS, DEFERRED_CLEANUP_RETRY_DELAY_MS,
  deferredInstallCleanupScript, INSTALL_CLEANUP_RETRIES, INSTALL_CLEANUP_RETRY_DELAY_MS,
  obsoleteInstallDirectoryNames, obsoleteRuntimeLogNames, runtimeLogNeedsReset,
} from './install-cleanup.ts';

test('update cleanup selects only Squirrel versions older than the running app', () => {
  assert.deepEqual(obsoleteInstallDirectoryNames([
    'app-2.6.1', 'app-2.6.2', 'app-2.6.3-beta.1', 'app-2.6.3', 'APP-2.6.3',
    'app-2.6.4', 'app-3-staging', 'app-not-a-version-1',
    'packages', 'user-config', 'app-backup',
  ], 'app-2.6.3'), ['app-2.6.1', 'app-2.6.2', 'app-2.6.3-beta.1']);
  assert.equal(INSTALL_CLEANUP_RETRIES, 0);
  assert.equal(INSTALL_CLEANUP_RETRY_DELAY_MS, 0);
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

    const result = await cleanupPreviousInstall(current, ({ name }) => {
      assert.equal(fs.existsSync(path.join(root, name)), true);
      progress.push(name);
    });

    assert.deepEqual(progress, ['app-2.6.2', 'lib']);
    assert.deepEqual(result.removed, [old, legacyLibrary]);
    assert.deepEqual(result.failures, []);
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

test('deferred cleanup waits for the application to exit and retries exact literal paths', () => {
  const targets = [String.raw`C:\Apps\EA Media Tools\app-2.6.2`, String.raw`C:\Apps\quote'folder\app-2.6.4`];
  const script = deferredInstallCleanupScript(targets, 4321);
  const encodedTargets = Buffer.from(JSON.stringify(targets), 'utf8').toString('base64');

  assert.match(script, /Wait-Process -Id \$parentPid/);
  assert.match(script, /Remove-Item -LiteralPath \$target -Recurse -Force/);
  assert.match(script, new RegExp(encodedTargets));
  assert.doesNotMatch(script, /quote'folder/);
  assert.match(script, new RegExp(`attempt -lt ${DEFERRED_CLEANUP_ATTEMPTS}`));
  assert.match(script, new RegExp(`Milliseconds ${DEFERRED_CLEANUP_RETRY_DELAY_MS}`));
});

test('Windows deferred cleanup helper removes a residual directory outside the parent process', {
  skip: process.platform !== 'win32',
}, async () => {
  const root = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'ea-deferred-install-cleanup-'));
  const target = path.join(root, 'app-2.6.2');
  await fs.promises.mkdir(path.join(target, 'resources'), { recursive: true });
  await fs.promises.writeFile(path.join(target, 'resources', 'app.asar'), 'obsolete');
  try {
    const moduleUrl = new URL('./install-cleanup.ts', import.meta.url).href;
    const targetData = Buffer.from(target, 'utf8').toString('base64');
    const schedulerSource = [
      `import { scheduleInstallCleanupAfterExit } from ${JSON.stringify(moduleUrl)};`,
      `const target = Buffer.from('${targetData}', 'base64').toString('utf8');`,
      'if (!scheduleInstallCleanupAfterExit([target])) process.exitCode = 1;',
    ].join('\n');
    const scheduler = spawn(process.execPath, [
      '--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', '--input-type=module', '-e', schedulerSource,
    ], { stdio: 'ignore' });
    const schedulerExit = await new Promise<number | null>((resolve) => scheduler.once('exit', resolve));
    assert.equal(schedulerExit, 0);
    const deadline = Date.now() + 10_000;
    while (fs.existsSync(target) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    assert.equal(fs.existsSync(target), false);
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
