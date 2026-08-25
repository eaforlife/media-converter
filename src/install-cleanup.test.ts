import assert from 'node:assert/strict';
import test from 'node:test';
import { obsoleteInstallDirectoryNames } from './install-cleanup.ts';

test('update cleanup selects only obsolete Squirrel version directories', () => {
  assert.deepEqual(obsoleteInstallDirectoryNames([
    'app-1.0.0', 'app-1.1.0', 'app-1.2.0', 'packages', 'user-config', 'app-backup',
  ], 'app-1.2.0'), ['app-1.0.0', 'app-1.1.0']);
});
