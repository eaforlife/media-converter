import { app, dialog, net } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_CONFIG, APP_NAME, CONFIG_SOURCE_URL, type AppConfiguration, parseAppConfiguration, setAppConfiguration,
  URGENT_UPDATE_SOURCE_URL,
} from './config';
import { logActivity } from './app-logger';
import { presetContentsMatch } from './preset-sync';
import type { HardwareCapabilities } from './shared-types';
import { compareIniVersions, iniVersion, sourceIniIsNewer } from './ini-version.ts';

export const configFilePath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'config.ini')
  : path.join(app.getAppPath(), 'config.ini');

const managedConfigFilePath = () => path.join(app.getPath('userData'), 'config.ini');
const legacyManagedConfigFilePath = () => path.join(app.getPath('userData'), 'managed-config.ini');
let activeConfigFilePath: string | null = null;

export const activeConfigPath = () => activeConfigFilePath ?? configFilePath();

export const readConfigFile = () =>
  fs.promises.readFile(activeConfigPath(), 'utf8');

const fetchText = async (url: string, timeoutMs = 15_000) => {
  const response = await net.fetch(url, {
    cache: 'no-store',
    headers: { 'User-Agent': `${(APP_NAME || 'EA Media Tools').replace(/\s+/g, '-')}/${app.getVersion()}` },
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!response.ok) throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
  return response.text();
};

const validateConfigContents = (contents: string) => {
  if (Buffer.byteLength(contents, 'utf8') > 64 * 1024) throw new Error('Remote config.ini exceeds 65536 bytes');
  parseAppConfiguration(contents);
  return contents;
};

const synchronizeConfigFile = async (target: string, remoteContents: string) => {
  validateConfigContents(remoteContents);
  const current = await fs.promises.readFile(target, 'utf8').catch(() => null);
  if (current !== null && presetContentsMatch(current, remoteContents)) return false;
  await fs.promises.mkdir(path.dirname(target), { recursive: true });
  const temporary = path.join(path.dirname(target), `.${path.basename(target)}.${process.pid}.${Date.now()}.tmp`);
  try {
    await fs.promises.writeFile(temporary, remoteContents, { encoding: 'utf8', flag: 'wx' });
    await fs.promises.rename(temporary, target);
  } finally {
    await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
  }
  return true;
};

const sectionLines = (contents: string, sectionName: string) => {
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${sectionName}]`);
  if (start < 0) return null;
  const nextSection = lines.findIndex((line, index) => index > start && /^\s*\[[^\]]+\]\s*$/.test(line));
  return lines.slice(start, nextSection < 0 ? lines.length : nextSection);
};

const replaceSection = (contents: string, sectionName: string, replacement: string[]) => {
  const lines = contents.replace(/^\uFEFF/, '').split(/\r?\n/);
  const start = lines.findIndex((line) => line.trim() === `[${sectionName}]`);
  if (start >= 0) {
    const nextSection = lines.findIndex((line, index) => index > start && /^\s*\[[^\]]+\]\s*$/.test(line));
    lines.splice(start, (nextSection < 0 ? lines.length : nextSection) - start);
  }
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  return `${lines.join('\n')}\n\n${replacement.join('\n')}\n`;
};

const preserveSystemCapabilityCache = async (contents: string) => {
  const existing = await Promise.all([
    fs.promises.readFile(managedConfigFilePath(), 'utf8').catch(() => ''),
    fs.promises.readFile(legacyManagedConfigFilePath(), 'utf8').catch(() => ''),
  ]);
  const cache = existing.map((item) => sectionLines(item, 'System Capability Cache')).find(Boolean);
  return cache ? replaceSection(contents, 'System Capability Cache', cache) : contents;
};

const validConfigFile = async (target: string) => {
  try {
    parseAppConfiguration(await fs.promises.readFile(target, 'utf8'));
    return true;
  } catch {
    return false;
  }
};

const newestVersionedConfig = (...contents: string[]) => contents.reduce((newest, candidate) => {
  if (!candidate) return newest;
  const comparison = compareIniVersions(iniVersion(candidate), iniVersion(newest));
  return !newest || comparison !== null && comparison > 0 ? candidate : newest;
}, '');

export const loadAppConfiguration = async (): Promise<AppConfiguration> => {
  const installed = configFilePath();
  const managed = managedConfigFilePath();
  activeConfigFilePath = installed;
  if (app.isPackaged) {
    try {
      const remoteContents = validateConfigContents(await fetchText(CONFIG_SOURCE_URL));
      if (!iniVersion(remoteContents)) throw new Error('Remote config.ini has no valid [Version: major.minor.patch] header');
      const [installedContents, managedContents] = await Promise.all([
        fs.promises.readFile(installed, 'utf8').catch(() => ''),
        fs.promises.readFile(managed, 'utf8').catch(() => ''),
      ]);
      let installedUpdated = false;
      if (sourceIniIsNewer(remoteContents, installedContents)) {
        try { installedUpdated = await synchronizeConfigFile(installed, remoteContents); }
        catch (error) {
          logActivity('WARN', 'config.remote.installed-readonly', {
            destination: installed, reason: error instanceof Error ? error.message : String(error),
          });
        }
      }
      const newestLocal = newestVersionedConfig(
        await validConfigFile(managed) ? managedContents : '', installedContents,
      );
      const baseContents = sourceIniIsNewer(remoteContents, newestLocal) ? remoteContents : newestLocal || remoteContents;
      const contentsWithCache = validateConfigContents(await preserveSystemCapabilityCache(baseContents));
      const updated = await synchronizeConfigFile(managed, contentsWithCache);
      activeConfigFilePath = managed;
      logActivity('INFO', updated ? 'config.remote.updated' : 'config.remote.current', {
        version: iniVersion(baseContents), source: CONFIG_SOURCE_URL, destination: managed, installedUpdated,
      });
    } catch (error) {
      const managedValid = await validConfigFile(managed);
      const [managedContents, installedContents] = await Promise.all([
        managedValid ? fs.promises.readFile(managed, 'utf8').catch(() => '') : Promise.resolve(''),
        fs.promises.readFile(installed, 'utf8').catch(() => ''),
      ]);
      const newestLocal = newestVersionedConfig(managedContents, installedContents);
      if (newestLocal === managedContents && managedValid) activeConfigFilePath = managed;
      else if (await validConfigFile(installed)) activeConfigFilePath = installed;
      else if (await validConfigFile(legacyManagedConfigFilePath())) activeConfigFilePath = legacyManagedConfigFilePath();
      logActivity('WARN', 'config.remote.unavailable', {
        source: CONFIG_SOURCE_URL, fallback: activeConfigFilePath,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  } else {
    try {
      const sourceContents = validateConfigContents(await fs.promises.readFile(installed, 'utf8'));
      const existingManaged = await fs.promises.readFile(managed, 'utf8').catch(() => '');
      const baseContents = sourceIniIsNewer(existingManaged, sourceContents) ? existingManaged : sourceContents;
      const localContents = validateConfigContents(await preserveSystemCapabilityCache(baseContents));
      await synchronizeConfigFile(managed, localContents);
      activeConfigFilePath = managed;
    } catch (error) {
      if (await validConfigFile(managed)) activeConfigFilePath = managed;
      else throw error;
    }
  }
  try {
    const configuration = parseAppConfiguration(await readConfigFile());
    setAppConfiguration(configuration);
    logActivity('INFO', 'config.loaded', { source: activeConfigPath(), encoders: configuration.encoders.length });
  } catch (error) {
    logActivity('ERROR', 'config.load.failed', { source: activeConfigPath(), error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
  return APP_CONFIG;
};

export const saveSystemCapabilityCache = async (
  driverVersion: string,
  ffmpegVersion: string,
  capabilities: HardwareCapabilities,
) => {
  const destination = activeConfigPath();
  const contents = await fs.promises.readFile(destination, 'utf8');
  const section = [
    '[System Capability Cache]',
    `driver_version=${driverVersion}`,
    `ffmpeg_version=${ffmpegVersion}`,
    `checked_at=${capabilities.checkedAt}`,
    `capabilities_json=${JSON.stringify(capabilities)}`,
  ];
  const updated = replaceSection(contents, 'System Capability Cache', section);
  validateConfigContents(updated);
  await synchronizeConfigFile(destination, updated);
  const configuration = parseAppConfiguration(updated);
  setAppConfiguration(configuration);
  return configuration.systemCapabilities;
};

export type UpdatePolicy = { urgentUpdate: boolean; minVersion: string };

export const parseUpdatePolicy = (contents: string): UpdatePolicy => {
  const values = new Map(contents.replace(/^\uFEFF/, '').split(/\r?\n/).flatMap((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) return [];
    const separator = trimmed.indexOf('=');
    return separator > 0 ? [[trimmed.slice(0, separator).trim(), trimmed.slice(separator + 1).trim()]] : [];
  }));
  return {
    urgentUpdate: values.get('urgentUpdate') === '1',
    minVersion: values.get('minVersion') || '0.0.0',
  };
};

const compareVersions = (left: string, right: string) => {
  const a = left.split(/[.-]/).map((part) => Number(part) || 0);
  const b = right.split(/[.-]/).map((part) => Number(part) || 0);
  for (let index = 0; index < Math.max(a.length, b.length); index++) {
    const delta = (a[index] ?? 0) - (b[index] ?? 0);
    if (delta !== 0) return delta;
  }
  return 0;
};

export const enforceUrgentUpdatePolicy = async (onUpdateRequested: () => Promise<void>) => {
  if (!app.isPackaged) return true;
  try {
    const policy = parseUpdatePolicy(await fetchText(URGENT_UPDATE_SOURCE_URL, 8_000));
    if (!policy.urgentUpdate || compareVersions(app.getVersion(), policy.minVersion) >= 0) return true;
    logActivity('ERROR', 'update.urgent.required', { currentVersion: app.getVersion(), minVersion: policy.minVersion });
    const result = await dialog.showMessageBox({
      type: 'warning',
      buttons: ['Update and restart', 'Exit'],
      defaultId: 0,
      cancelId: 1,
      title: `${APP_NAME || 'EA Media Tools'} Update Required`,
      message: `${APP_NAME || 'EA Media Tools'} must be updated before it can run.`,
      detail: `Installed version: ${app.getVersion()}\nRequired version: ${policy.minVersion}`,
    });
    if (result.response === 0) await onUpdateRequested();
    else app.quit();
    return false;
  } catch (error) {
    logActivity('WARN', 'update.urgent.unavailable', {
      source: URGENT_UPDATE_SOURCE_URL,
      reason: error instanceof Error ? error.message : String(error),
    });
    return true;
  }
};
