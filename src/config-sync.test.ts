import assert from 'node:assert/strict';
import test from 'node:test';
import { configSourceContentsMatch, replaceConfigContentBeforeCache, setConfigAppVersion } from './config-sync.ts';

test('config source refresh replaces defaults but preserves the installed capability cache', () => {
  const installed = '[App Version: 2.9.2]\n\n[App]\nname=Old\n\n[System Capability Cache]\ncache_tag=1\ndriver_version=555.1\ncapabilities_json={"encoders":[]}\n';
  const source = '[App Version: 2.9.2]\n\n[App]\nname=New\n\n[UI Defaults]\ndefault_video_codec=HEVC\n';
  const result = replaceConfigContentBeforeCache(source, installed);
  assert.match(result, /name=New/);
  assert.doesNotMatch(result, /name=Old/);
  assert.match(result, /driver_version=555\.1/);
  assert.equal(configSourceContentsMatch(result, installed), false);
});

test('config source comparison ignores capability cache changes and handles Windows lines', () => {
  const first = '[App Version: 2.9.2]\r\n[App]\r\nname=App\r\n[System Capability Cache]\r\ndriver_version=1\r\n';
  const second = '[App Version: 2.9.2]\n[App]\nname=App\n[System Capability Cache]\ndriver_version=2\n';
  assert.equal(configSourceContentsMatch(first, second), true);
});

test('source config app version is set to the running app version', () => {
  assert.equal(setConfigAppVersion('[App Version: 2.9.2]\n[App]\n', '2.9.3'), '[App Version: 2.9.3]\n[App]\n');
});
