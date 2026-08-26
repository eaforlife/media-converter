import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { parseBuiltInPresets } from './presets';

export const presetFilePath = () => app.isPackaged
  ? path.join(process.resourcesPath, 'presets.ini')
  : path.join(app.getAppPath(), 'presets.ini');

export const loadBuiltInPresets = async () => {
  const contents = await fs.promises.readFile(presetFilePath(), 'utf8');
  return parseBuiltInPresets(contents);
};

export const readPresetFile = () => fs.promises.readFile(presetFilePath(), 'utf8');
