import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { parseCustomPresets, serializeCustomPresets } from './custom-presets';
import type { SavedPreset } from './shared-types';

export const customPresetFilePath = () => path.join(app.getPath('userData'), 'custom_preset.ini');

export const loadCustomPresets = async () => {
  try {
    return parseCustomPresets(await fs.promises.readFile(customPresetFilePath(), 'utf8'));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
};

export const saveCustomPresets = async (presets: SavedPreset[]) => {
  const destination = customPresetFilePath();
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp`;
  await fs.promises.writeFile(temporary, serializeCustomPresets(presets), 'utf8');
  await fs.promises.rename(temporary, destination);
};

export const readCustomPresetFile = async () => {
  try {
    return await fs.promises.readFile(customPresetFilePath(), 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
};
