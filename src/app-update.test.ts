import { equal, match } from 'node:assert/strict';
import { test } from 'node:test';
import { APP_UPDATE_REPOSITORY } from './config.ts';
import {
  electronUpdateFeedUrl,
  friendlyUpdateError,
  isUpdateCheckAlreadyRunningError,
  manualUpdateUnavailableMessage,
  shouldInitializeAppUpdater,
  UpdateCheckState,
} from './app-update.ts';

test('the updater uses the canonical repository slug', () => {
  equal(APP_UPDATE_REPOSITORY, 'eaforlife/media-converter');
  equal(
    electronUpdateFeedUrl(APP_UPDATE_REPOSITORY, 'win32', 'x64', '0.3.1'),
    'https://update.electronjs.org/eaforlife/media-converter/win32-x64/0.3.1',
  );
});

test('automatic Squirrel updates are limited to the safe Windows architecture', () => {
  equal(shouldInitializeAppUpdater('win32', 'x64'), true);
  equal(shouldInitializeAppUpdater('win32', 'arm64'), false);
  equal(shouldInitializeAppUpdater('darwin', 'arm64'), false);
  match(manualUpdateUnavailableMessage('win32', 'arm64') ?? '', /Download the latest installer/);
  match(manualUpdateUnavailableMessage('darwin', 'arm64') ?? '', /signed macOS build/);
});

test('Squirrel 404 errors are reduced to an actionable message', () => {
  const error = friendlyUpdateError('Command failed: 4294967295\nSystem.Net.WebException: (404) Not Found.');
  match(error, /could not find the release feed/);
  match(error, /github\.com\/eaforlife\/media-converter\/releases/);
});

test('automatic and manual update checks share one active Squirrel process', () => {
  const state = new UpdateCheckState();
  equal(state.reserveCheck(), true);
  equal(state.reserveCheck(), false);
  state.markDownloading();
  equal(state.reserveCheck(), false);
  state.markDownloaded();
  equal(state.reserveCheck(), false);
  state.markIdle();
  equal(state.reserveCheck(), true);
});

test('recognizes Squirrel already-running failures as a concurrent check', () => {
  equal(isUpdateCheckAlreadyRunningError(
    'AutoUpdater process with arguments --checkForUpdate,https://example.test is already running',
  ), true);
  equal(isUpdateCheckAlreadyRunningError('The update service returned HTTP 500'), false);
});
