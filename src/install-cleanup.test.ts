import assert from 'node:assert/strict';
import test from 'node:test';
import { obsoleteInstallDirectoryNames, obsoleteRuntimeLogNames, runtimeLogNeedsReset } from './install-cleanup.ts';

test('update cleanup selects only obsolete Squirrel version directories', () => {
  assert.deepEqual(obsoleteInstallDirectoryNames([
    'app-1.0.0', 'app-1.1.0', 'app-1.2.0', 'packages', 'user-config', 'app-backup',
  ], 'app-1.2.0'), ['app-1.0.0', 'app-1.1.0']);
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
