import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import {
  APP_CONFIG, type AppConfiguration, DEFAULT_CONFIG_INI, parseAppConfiguration, setAppConfiguration,
} from './config';
import { logActivity } from './app-logger';

export const configFilePath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'config.ini')
  : path.join(app.getAppPath(), 'config.ini');

export const readConfigFile = () =>
  fs.promises.readFile(configFilePath(), 'utf8').catch(() => DEFAULT_CONFIG_INI);

export const loadAppConfiguration = async (): Promise<AppConfiguration> => {
  const source = configFilePath();
  try {
    const configuration = parseAppConfiguration(await readConfigFile());
    setAppConfiguration(configuration);
    logActivity('INFO', 'config.loaded', { source, encoders: configuration.encoders.length });
  } catch (error) {
    setAppConfiguration(parseAppConfiguration(DEFAULT_CONFIG_INI));
    logActivity('ERROR', 'config.load.failed', {
      source,
      fallback: 'embedded',
      error: error instanceof Error ? error.message : String(error),
    });
  }
  return APP_CONFIG;
};
