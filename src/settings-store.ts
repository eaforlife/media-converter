import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { BUILT_IN_PRESETS } from './presets';
import type { AppSettings, FilterSettings, SavedPreset, ScaleMode } from './shared-types';

const DEFAULT_SETTINGS: AppSettings = {
  hardwareAcceleration: true,
  useStableFfmpeg: true,
  smartFileNaming: true,
  lastPreset: 'Streaming',
  lastSourceDirectory: '',
  customPresets: [],
  workingPreset: null,
  separateAudioDirectory: true,
};

const xmlEscape = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const xmlUnescape = (value: string) => value
  .replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/&gt;/g, '>')
  .replace(/&lt;/g, '<').replace(/&amp;/g, '&');
const bool = (value: string | undefined, fallback: boolean) => value === undefined ? fallback : value === 'true';
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

const defaultFilters = (): FilterSettings => ({
  autoCrop: true, toneMapHdrToSdr: true, pixelFormat10Bit: false,
  scale: 'disabled', scaleLocked: false,
  remuxAudio: true, remuxSubtitles: true, stripMetadata: true,
  doNotReplaceAudio: false,
  extractClosedCaptions: false,
  downmixToStereo: true,
  resampleLosslessTo48k: true,
  normalizeAudio: true,
});

const parsePresets = (xml: string): SavedPreset[] => {
  const presets: SavedPreset[] = [];
  const presetPattern = /<preset\s+name="([^"]*)">([\s\S]*?)<\/preset>/gi;
  for (const match of xml.matchAll(presetPattern)) {
    const body = match[2];
    const filterMatch = body.match(/<filters\s+([^>]*)\/>/i);
    const attributes = Object.fromEntries([...(filterMatch?.[1] ?? '').matchAll(/([\w]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
    const scale = attributes.scale as ScaleMode;
    presets.push({
      name: xmlUnescape(match[1]),
      workflow: (tag(body, 'workflow') || 'video') as SavedPreset['workflow'],
      format: (tag(body, 'format') || 'mp4') as SavedPreset['format'],
      encoder: xmlUnescape(tag(body, 'encoder') || 'libx264'),
      quality: tag(body, 'quality') || '20',
      videoBitrate: tag(body, 'videoBitrate') || '0',
      maxRate: tag(body, 'maxRate') || '0',
      bufferMultiplier: Number(tag(body, 'bufferMultiplier')) || 1,
      bufferSize: tag(body, 'bufferSize') || '0',
      deliveryMode: bool(tag(body, 'deliveryMode'), false),
      audioCodec: (tag(body, 'audioCodec') || 'libfdk_aac') as SavedPreset['audioCodec'],
      audioBitrate: tag(body, 'audioBitrate') || '192k',
      filters: {
        ...defaultFilters(),
        autoCrop: bool(attributes.autoCrop, true),
        toneMapHdrToSdr: bool(attributes.toneMapHdrToSdr, true),
        pixelFormat10Bit: bool(attributes.pixelFormat10Bit, false),
        scale: ['auto', '1080p', '720p', '360p', 'disabled'].includes(scale) ? scale : 'disabled',
        scaleLocked: bool(attributes.scaleLocked, false),
        doNotReplaceAudio: bool(attributes.doNotReplaceAudio, false),
        extractClosedCaptions: bool(attributes.extractClosedCaptions, false),
        downmixToStereo: bool(attributes.downmixToStereo, true),
        resampleLosslessTo48k: bool(attributes.resampleLosslessTo48k, true),
        normalizeAudio: bool(attributes.normalizeAudio, true),
      },
    });
  }
  return presets;
};

const serializePreset = (preset: SavedPreset, indent: string) => `${indent}<preset name="${xmlEscape(preset.name)}">
${indent}  <workflow>${preset.workflow ?? 'video'}</workflow>
${indent}  <format>${preset.format}</format>
${indent}  <encoder>${xmlEscape(preset.encoder)}</encoder>
${indent}  <quality>${xmlEscape(preset.quality)}</quality>
${indent}  <videoBitrate>${xmlEscape(preset.videoBitrate)}</videoBitrate>
${indent}  <maxRate>${xmlEscape(preset.maxRate)}</maxRate>
${indent}  <bufferMultiplier>${preset.bufferMultiplier}</bufferMultiplier>
${indent}  <bufferSize>${xmlEscape(preset.bufferSize)}</bufferSize>
${indent}  <deliveryMode>${preset.deliveryMode}</deliveryMode>
${indent}  <audioCodec>${preset.audioCodec}</audioCodec>
${indent}  <audioBitrate>${xmlEscape(preset.audioBitrate)}</audioBitrate>
${indent}  <filters autoCrop="${preset.filters.autoCrop}" toneMapHdrToSdr="${preset.filters.toneMapHdrToSdr}" pixelFormat10Bit="${preset.filters.pixelFormat10Bit}" scale="${preset.filters.scale}" scaleLocked="${preset.filters.scaleLocked}" doNotReplaceAudio="${preset.filters.doNotReplaceAudio}" extractClosedCaptions="${preset.filters.extractClosedCaptions}" downmixToStereo="${preset.filters.downmixToStereo}" resampleLosslessTo48k="${preset.filters.resampleLosslessTo48k}" normalizeAudio="${preset.filters.normalizeAudio}" />
${indent}</preset>`;

const serializeBuiltInPresets = () => Object.values(BUILT_IN_PRESETS).map((preset) => `    <preset name="${preset.name}" fixed="true">
      <format>${preset.format}</format>
      <preferredVideoCodec>${preset.preferredVideoCodec}</preferredVideoCodec>
      <quality nvenc="${preset.quality.nvenc}" amf="${preset.quality.amf}" qsv="${preset.quality.qsv}" software="${preset.quality.software}" />
      <bitrateControl>${preset.bitrateControl}</bitrateControl>
      <bufferMultiplier>${preset.bufferMultiplier}</bufferMultiplier>
      <scale>${preset.scale}</scale>
      <audio codec="aac" stereo="${preset.audioRates.aac.stereo}" surround="${preset.audioRates.aac.surround}" />
      <audio codec="opus" stereo="${preset.audioRates.opus.stereo}" surround="${preset.audioRates.opus.surround}" />
    </preset>`).join('\n');

const serialize = (settings: AppSettings) => `<?xml version="1.0" encoding="UTF-8"?>
<eaMediaToolsSettings version="7">
  <hardwareAcceleration>${settings.hardwareAcceleration}</hardwareAcceleration>
  <useStableFfmpeg>${settings.useStableFfmpeg}</useStableFfmpeg>
  <smartFileNaming>${settings.smartFileNaming}</smartFileNaming>
  <lastPreset>${xmlEscape(settings.lastPreset)}</lastPreset>
  <lastSourceDirectory>${xmlEscape(settings.lastSourceDirectory)}</lastSourceDirectory>
  <separateAudioDirectory>${settings.separateAudioDirectory}</separateAudioDirectory>
  <predefinedPresets>
${serializeBuiltInPresets()}
  </predefinedPresets>
  <workingPreset>
${settings.workingPreset ? serializePreset(settings.workingPreset, '    ') : ''}
  </workingPreset>
  <customPresets>
${settings.customPresets.map((preset) => serializePreset(preset, '    ')).join('\n')}
  </customPresets>
</eaMediaToolsSettings>
`;

const configPath = () => path.join(app.getPath('userData'), 'config');

export const loadSettings = async (): Promise<AppSettings> => {
  try {
    const xml = await fs.promises.readFile(configPath(), 'utf8');
    return {
      hardwareAcceleration: bool(tag(xml, 'hardwareAcceleration'), true),
      useStableFfmpeg: bool(tag(xml, 'useStableFfmpeg'), true),
      smartFileNaming: bool(tag(xml, 'smartFileNaming'), true),
      lastPreset: xmlUnescape(tag(xml, 'lastPreset') || 'Streaming'),
      lastSourceDirectory: xmlUnescape(tag(xml, 'lastSourceDirectory') || ''),
      customPresets: parsePresets(tag(xml, 'customPresets') || ''),
      workingPreset: parsePresets(tag(xml, 'workingPreset') || '')[0] ?? null,
      separateAudioDirectory: bool(tag(xml, 'separateAudioDirectory'), true),
    };
  } catch {
    return structuredClone(DEFAULT_SETTINGS);
  }
};

export const saveSettings = async (settings: AppSettings) => {
  const directory = app.getPath('userData');
  const destination = configPath();
  const temporary = `${destination}.tmp`;
  await fs.promises.mkdir(directory, { recursive: true });
  await fs.promises.writeFile(temporary, serialize(settings), 'utf8');
  await fs.promises.rename(temporary, destination);
};

export const readConfig = async (runningSettings?: AppSettings) => {
  return serialize(runningSettings ?? await loadSettings());
};
