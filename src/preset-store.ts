import { app, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { APP_NAME, PRESET_SOURCE_URL } from './config';
import { appStoragePath } from './app-storage';
import { logActivity } from './app-logger';
import { parseBuiltInPresetConfiguration } from './presets';
import { synchronizePresetFile, validateRemotePresetContents } from './preset-sync';
import { compareIniVersions, iniVersion, sourceIniIsNewer } from './ini-version.ts';

const installedPresetFilePath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'presets.ini')
  : path.join(app.getAppPath(), 'presets.ini');

const managedPresetFilePath = () => path.join(appStoragePath(), 'managed-presets.ini');
let activePresetFilePath: string | null = null;
let presetInitialization: Promise<void> | null = null;

export const presetFilePath = () => activePresetFilePath ?? installedPresetFilePath();

const validPresetFile = async (target: string) => {
  try {
    parseBuiltInPresetConfiguration(await fs.promises.readFile(target, 'utf8'));
    return true;
  } catch {
    return false;
  }
};

const presetVersionForFile = async (target: string) => {
  try {
    return parseBuiltInPresetConfiguration(await fs.promises.readFile(target, 'utf8')).version;
  } catch {
    return 'unknown';
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
      const presetVersion = parseBuiltInPresetConfiguration(remoteContents).version;
      if (!iniVersion(remoteContents)) throw new Error('Remote presets.ini has no valid [Version: major.minor.patch] header');
      const [managedContents, installedContents] = await Promise.all([
        fs.promises.readFile(managed, 'utf8').catch(() => ''),
        fs.promises.readFile(installed, 'utf8').catch(() => ''),
      ]);
      const managedValid = await validPresetFile(managed);
      const newestLocal = [managedValid ? managedContents : '', installedContents].reduce((newest, candidate) => {
        if (!candidate) return newest;
        const order = compareIniVersions(iniVersion(candidate), iniVersion(newest));
        return !newest || order !== null && order > 0 ? candidate : newest;
      }, '');
      const latestContents = sourceIniIsNewer(remoteContents, newestLocal) ? remoteContents : newestLocal || remoteContents;
      if (latestContents === remoteContents && sourceIniIsNewer(remoteContents, installedContents)) {
        try {
          await synchronizePresetFile(installed, remoteContents);
          activePresetFilePath = installed;
          logActivity('INFO', 'presets.remote.updated', {
            version: presetVersion, source: PRESET_SOURCE_URL, destination: installed,
          });
          return;
        } catch (error) {
          await synchronizePresetFile(managed, remoteContents);
          activePresetFilePath = managed;
          logActivity('WARN', 'presets.remote.managed-fallback', {
            version: presetVersion, source: PRESET_SOURCE_URL, destination: managed,
            reason: error instanceof Error ? error.message : String(error),
          });
          return;
        }
      }
      if (latestContents === managedContents && managedValid) activePresetFilePath = managed;
      else if (latestContents === installedContents && installedContents) activePresetFilePath = installed;
      else {
        await synchronizePresetFile(managed, latestContents);
        activePresetFilePath = managed;
      }
      logActivity('INFO', latestContents === remoteContents ? 'presets.remote.current' : 'presets.local.newer', {
        version: iniVersion(latestContents) ?? presetVersion,
        source: PRESET_SOURCE_URL, destination: activePresetFilePath,
      });
    } catch (error) {
      const managedValid = await validPresetFile(managed);
      const [managedContents, installedContents] = await Promise.all([
        managedValid ? fs.promises.readFile(managed, 'utf8').catch(() => '') : Promise.resolve(''),
        fs.promises.readFile(installed, 'utf8').catch(() => ''),
      ]);
      const newestLocal = [managedContents, installedContents].reduce((newest, candidate) => {
        const order = compareIniVersions(iniVersion(candidate), iniVersion(newest));
        return candidate && (!newest || order !== null && order > 0) ? candidate : newest;
      }, '');
      if (newestLocal === managedContents && managedValid) activePresetFilePath = managed;
      else if (installedContents) activePresetFilePath = installed;
      logActivity('WARN', 'presets.remote.unavailable', {
        version: await presetVersionForFile(activePresetFilePath),
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
  return parseBuiltInPresetConfiguration(contents);
};

export const readPresetFile = () => fs.promises.readFile(presetFilePath(), 'utf8');
