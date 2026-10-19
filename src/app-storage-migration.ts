import fs from 'node:fs';
import path from 'node:path';
import { parseCustomPresets } from './custom-presets.ts';
import { DEFAULT_PERSONALIZED_DEFAULTS, parsePersonalizedDefaults, replacePersonalizedDefaults } from './personalized-defaults.ts';
import { parseIniSections, presetFrameRateValue } from './presets.ts';
import type { AdvancedVideoSettings, SavedPreset } from './shared-types';

export type CustomPresetMigrationResult = { safeToCleanPrevious: boolean; copiedFrom: string | null };

const legacyPresetFromXml = (xml: string): SavedPreset | null => {
  const body = xml.match(/<workingPreset>([\s\S]*?)<\/workingPreset>/i)?.[1] ?? '';
  const match = body.match(/<preset\s+name="([^"]*)">([\s\S]*?)<\/preset>/i);
  if (!match) return null;
  const presetXml = match[2];
  const read = (name: string) => presetXml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))?.[1];
  const unescape = (value: string) => value.replace(/&apos;/g, "'").replace(/&quot;/g, '"')
    .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
  const bool = (value: string | undefined, fallback: boolean) => value === undefined ? fallback : value === 'true' || value === '1';
  const attrs = (name: string) => Object.fromEntries(
    [...(presetXml.match(new RegExp(`<${name}\\s+([^>]*)\\/>`, 'i'))?.[1] ?? '').matchAll(/([\w]+)="([^"]*)"/g)]
      .map((item) => [item[1], item[2]]),
  );
  const filters = attrs('filters');
  const advanced = attrs('advancedVideo');
  const scale = ['auto', '1080p', '720p', '360p', 'disabled'].includes(filters.scale) ? filters.scale : 'disabled';
  const advancedDefaults: AdvancedVideoSettings = {
    bFrames: false, multipass: 0, bRefMode: 'disabled', adaptiveBFrames: false,
    sceneCutDetection: false, rcLookahead: 0, nonReferenceP: false, spatialAq: 0, temporalAq: false,
  };
  return {
    name: unescape(match[1]), description: unescape(read('description') || match[1]),
    workflow: (read('workflow') || 'video') as SavedPreset['workflow'],
    format: (read('format') || 'mp4') as SavedPreset['format'],
    encoder: unescape(read('encoder') || 'libx264'),
    encoderSpeed: Math.min(7, Math.max(1, Number(read('encoderSpeed')) || Number((read('encoderPreset') || '').replace(/^p/i, '')) || 4)),
    encoderTune: unescape(read('encoderTune') || ''), encoderProfile: unescape(read('encoderProfile') || ''),
    frameRate: presetFrameRateValue(read('frameRate') || 'passthrough', 'frameRate'),
    quality: read('quality') || '20', videoBitrate: read('videoBitrate') || '0', maxRate: read('maxRate') || '0',
    bufferMultiplier: read('bufferMultiplier') === undefined ? 1 : Math.min(20, Math.max(0, Number(read('bufferMultiplier')) || 0)),
    bufferSize: read('bufferSize') || '0', deliveryMode: bool(read('deliveryMode'), false),
    advancedVideo: {
      bFrames: bool(advanced.bFrames, advancedDefaults.bFrames),
      multipass: Math.min(2, Math.max(0, Number(advanced.multipass) || 0)) as AdvancedVideoSettings['multipass'],
      bRefMode: ['disabled', 'each', 'middle'].includes(advanced.bRefMode)
        ? advanced.bRefMode as AdvancedVideoSettings['bRefMode'] : advancedDefaults.bRefMode,
      adaptiveBFrames: bool(advanced.adaptiveBFrames, advancedDefaults.adaptiveBFrames),
      sceneCutDetection: bool(advanced.sceneCutDetection, advancedDefaults.sceneCutDetection),
      rcLookahead: Math.min(42, Math.max(0, Number(advanced.rcLookahead) || 0)),
      nonReferenceP: bool(advanced.nonReferenceP, advancedDefaults.nonReferenceP),
      spatialAq: Math.min(15, Math.max(0, Number(advanced.spatialAq) || 0)),
      temporalAq: bool(advanced.temporalAq, advancedDefaults.temporalAq),
    },
    audioCodec: (read('audioCodec') || 'libfdk_aac') as SavedPreset['audioCodec'],
    audioBitrate: read('audioBitrate') || '192k',
    filters: {
      autoCrop: bool(filters.autoCrop, true), toneMapHdrToSdr: bool(filters.toneMapHdrToSdr, true),
      pixelFormat10Bit: bool(filters.pixelFormat10Bit, false), scale: scale as SavedPreset['filters']['scale'],
      scaleLocked: bool(filters.scaleLocked, false), remuxAudio: true, remuxSubtitles: true, stripMetadata: true,
      doNotReplaceAudio: bool(filters.doNotReplaceAudio, false), extractClosedCaptions: bool(filters.extractClosedCaptions, false),
      downmixToStereo: bool(filters.downmixToStereo, true), dynamicRangeCompression: bool(filters.dynamicRangeCompression, true),
      resampleLosslessTo48k: bool(filters.resampleLosslessTo48k, true), normalizeAudio: bool(filters.normalizeAudio, true),
    },
  };
};

export const migratePersonalizedDefaults = async (
  currentConfigPath: string,
  previousResourcesDirectories: readonly string[],
  legacyDataDirectories: readonly string[],
) => {
  const currentContents = await fs.promises.readFile(currentConfigPath, 'utf8');
  const currentDefaults = parsePersonalizedDefaults(parseIniSections(currentContents).get('Personalized Defaults'));
  if (JSON.stringify(currentDefaults) !== JSON.stringify(DEFAULT_PERSONALIZED_DEFAULTS)) return null;
  const candidates = [
    ...previousResourcesDirectories.map((directory) => path.join(directory, 'config.ini')),
    ...legacyDataDirectories.map((directory) => path.join(directory, 'config.ini')),
  ];
  for (const candidate of candidates) {
    const sourceContents = await fs.promises.readFile(candidate, 'utf8').catch(() => null);
    if (sourceContents === null) continue;
    const section = parseIniSections(sourceContents).get('Personalized Defaults');
    if (!section) continue;
    const updated = replacePersonalizedDefaults(currentContents, parsePersonalizedDefaults(section));
    await fs.promises.writeFile(currentConfigPath, updated, 'utf8');
    return candidate;
  }
  // Older builds saved these preferences in an XML file named `config` beside the app.
  for (const directory of [...previousResourcesDirectories, ...legacyDataDirectories]) {
    const xml = await fs.promises.readFile(path.join(directory, 'config'), 'utf8').catch(() => null);
    if (xml === null) continue;
    const read = (name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))?.[1];
    const unescape = (value: string) => value.replace(/&apos;/g, "'").replace(/&quot;/g, '"')
      .replace(/&gt;/g, '>').replace(/&lt;/g, '<').replace(/&amp;/g, '&');
    const bool = (name: string, fallback: boolean) => {
      const value = read(name);
      return value === undefined ? fallback : value === 'true' || value === '1';
    };
    const imported = {
      hardwareAcceleration: bool('hardwareAcceleration', true),
      useStableFfmpeg: bool('useStableFfmpeg', true),
      simultaneousEncoding: bool('simultaneousEncoding', true),
      smartFileNaming: bool('smartFileNaming', true),
      lastPreset: unescape(read('lastPreset') || 'Streaming'),
      lastSourceDirectory: unescape(read('lastSourceDirectory') || ''),
      workingPreset: legacyPresetFromXml(xml),
      separateAudioDirectory: bool('separateAudioDirectory', true),
    };
    await fs.promises.writeFile(currentConfigPath, replacePersonalizedDefaults(currentContents, imported), 'utf8');
    return path.join(directory, 'config');
  }
  return null;
};

export const migrateCustomPresetFile = async (
  currentResourcesDirectory: string,
  previousResourcesDirectories: readonly string[],
  legacyDataDirectories: readonly string[],
): Promise<CustomPresetMigrationResult> => {
  const destination = path.join(currentResourcesDirectory, 'custom_preset.ini');
  const validate = async (file: string) => {
    try {
      const contents = await fs.promises.readFile(file, 'utf8');
      parseCustomPresets(contents);
      return { exists: true, contents };
    } catch (error) {
      return (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? { exists: false, contents: '' }
        : null;
    }
  };

  const current = await validate(destination);
  if (current?.exists) return { safeToCleanPrevious: true, copiedFrom: null };
  if (!current) return { safeToCleanPrevious: false, copiedFrom: null };

  const candidates = [
    ...previousResourcesDirectories.map((directory) => path.join(directory, 'custom_preset.ini')),
    ...legacyDataDirectories.map((directory) => path.join(directory, 'custom_preset.ini')),
  ];
  for (const candidate of candidates) {
    const source = await validate(candidate);
    if (!source) return { safeToCleanPrevious: false, copiedFrom: null };
    if (!source.exists) continue;
    await fs.promises.mkdir(currentResourcesDirectory, { recursive: true });
    const temporary = `${destination}.${process.pid}.${Date.now()}.tmp`;
    try {
      await fs.promises.writeFile(temporary, source.contents, { encoding: 'utf8', flag: 'wx' });
      await fs.promises.rename(temporary, destination);
      return { safeToCleanPrevious: true, copiedFrom: candidate };
    } catch {
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      return { safeToCleanPrevious: false, copiedFrom: null };
    }
  }
  return { safeToCleanPrevious: true, copiedFrom: null };
};

const isSameOrParentOf = (parent: string, candidate: string) => {
  const relative = path.relative(path.resolve(parent), path.resolve(candidate));
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
};

export const removeLegacyDataDirectories = async (directories: readonly string[], activeInstallDirectory: string) => {
  const removed: string[] = [];
  const preserved: string[] = [];
  const seen = new Set<string>();
  for (const directory of directories) {
    const resolved = path.resolve(directory);
    const key = process.platform === 'win32' ? resolved.toLowerCase() : resolved;
    if (seen.has(key)) continue;
    seen.add(key);
    if (isSameOrParentOf(resolved, activeInstallDirectory)) {
      preserved.push(resolved);
      continue;
    }
    try {
      await fs.promises.rm(resolved, { recursive: true, force: true });
      removed.push(resolved);
    } catch {
      preserved.push(resolved);
    }
  }
  return { removed, preserved };
};
