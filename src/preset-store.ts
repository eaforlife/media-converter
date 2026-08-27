import { app, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { APP_NAME, PRESET_SOURCE_URL } from './config';
import { logActivity } from './app-logger';
import { parseBuiltInPresets } from './presets';
import { synchronizePresetFile, validateRemotePresetContents } from './preset-sync';

const installedPresetFilePath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'presets.ini')
  : path.join(app.getAppPath(), 'presets.ini');

const managedPresetFilePath = () => path.join(app.getPath('userData'), 'managed-presets.ini');
let activePresetFilePath: string | null = null;
let presetInitialization: Promise<void> | null = null;

export const presetFilePath = () => activePresetFilePath ?? installedPresetFilePath();

const validPresetFile = async (target: string) => {
  try {
    parseBuiltInPresets(await fs.promises.readFile(target, 'utf8'));
    return true;
  } catch {
    return false;
  }
};

const fetchRemotePresets = async () => {
  const response = await net.fetch(PRESET_SOURCE_URL, {
    cache: 'no-store',
    headers: { 'User-Agent': `${APP_NAME.replace(/\s+/g, '-')}/${app.getVersion()}` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
  return validateRemotePresetContents(await response.text());
};

export const initializeBuiltInPresets = () => {
  if (presetInitialization) return presetInitialization;
  presetInitialization = (async () => {
    const installed = installedPresetFilePath();
    activePresetFilePath = installed;
    if (!app.isPackaged) return;

    const managed = managedPresetFilePath();
    try {
      const remoteContents = await fetchRemotePresets();
      try {
        const updated = await synchronizePresetFile(installed, remoteContents);
        await fs.promises.rm(managed, { force: true }).catch(() => undefined);
        activePresetFilePath = installed;
        logActivity('INFO', updated ? 'presets.remote.updated' : 'presets.remote.current', {
          source: PRESET_SOURCE_URL, destination: installed,
        });
      } catch (error) {
        const updated = await synchronizePresetFile(managed, remoteContents);
        activePresetFilePath = managed;
        logActivity('WARN', 'presets.remote.managed-fallback', {
          source: PRESET_SOURCE_URL, destination: managed, updated,
          reason: error instanceof Error ? error.message : String(error),
        });
      }
    } catch (error) {
      if (await validPresetFile(managed)) activePresetFilePath = managed;
      logActivity('WARN', 'presets.remote.unavailable', {
        source: PRESET_SOURCE_URL, fallback: activePresetFilePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  })();
  return presetInitialization;
};

export const loadBuiltInPresets = async () => {
  await initializeBuiltInPresets();
  const contents = await fs.promises.readFile(presetFilePath(), 'utf8');
  return parseBuiltInPresets(contents);
};

export const readPresetFile = () => fs.promises.readFile(presetFilePath(), 'utf8');
