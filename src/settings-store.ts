import type { AppSettings } from './shared-types';
import { APP_CONFIG } from './config';
import { readConfigFile, savePersonalizedDefaults } from './config-store';
import { replacePersonalizedDefaults } from './personalized-defaults.ts';

const settingsDefaults = (settings: AppSettings) => ({
  hardwareAcceleration: settings.hardwareAcceleration,
  useStableFfmpeg: settings.useStableFfmpeg,
  simultaneousEncoding: settings.simultaneousEncoding,
  smartFileNaming: settings.smartFileNaming,
  lastPreset: settings.lastPreset,
  lastSourceDirectory: settings.lastSourceDirectory,
  workingPreset: settings.workingPreset,
  separateAudioDirectory: settings.separateAudioDirectory,
});

export const loadSettings = async (): Promise<AppSettings> => ({
  ...structuredClone(APP_CONFIG.personalizedDefaults),
  customPresets: [],
});

export const saveSettings = async (settings: AppSettings) => savePersonalizedDefaults(settingsDefaults(settings));

export const readConfig = async (runningSettings?: AppSettings) => {
  const contents = await readConfigFile();
  return runningSettings ? replacePersonalizedDefaults(contents, settingsDefaults(runningSettings)) : contents;
};
