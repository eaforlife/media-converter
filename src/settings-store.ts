import { app } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import type { AdvancedVideoSettings, AppSettings, FilterSettings, SavedPreset, ScaleMode } from './shared-types';
import { presetFrameRateValue } from './presets';

const DEFAULT_SETTINGS: AppSettings = {
  hardwareAcceleration: true,
  useStableFfmpeg: true,
  simultaneousEncoding: true,
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
const bool = (value: string | undefined, fallback: boolean) => value === undefined ? fallback : value === 'true' || value === '1';
const tag = (xml: string, name: string) => xml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`, 'i'))?.[1];

const defaultFilters = (): FilterSettings => ({
  autoCrop: true, toneMapHdrToSdr: true, pixelFormat10Bit: false,
  scale: 'disabled', scaleLocked: false,
  remuxAudio: true, remuxSubtitles: true, stripMetadata: true,
  doNotReplaceAudio: false,
  extractClosedCaptions: false,
  downmixToStereo: true,
  dynamicRangeCompression: true,
  resampleLosslessTo48k: true,
  normalizeAudio: true,
});

const defaultAdvancedVideo = (): AdvancedVideoSettings => ({
  bFrames: false, multipass: 0, bRefMode: 'disabled', adaptiveBFrames: false,
  sceneCutDetection: false, rcLookahead: 0, nonReferenceP: false, spatialAq: 0, temporalAq: false,
});

const parsePresets = (xml: string): SavedPreset[] => {
  const presets: SavedPreset[] = [];
  const presetPattern = /<preset\s+name="([^"]*)">([\s\S]*?)<\/preset>/gi;
  for (const match of xml.matchAll(presetPattern)) {
    const body = match[2];
    const filterMatch = body.match(/<filters\s+([^>]*)\/>/i);
    const attributes = Object.fromEntries([...(filterMatch?.[1] ?? '').matchAll(/([\w]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
    const advancedMatch = body.match(/<advancedVideo\s+([^>]*)\/>/i);
    const advanced = Object.fromEntries([...(advancedMatch?.[1] ?? '').matchAll(/([\w]+)="([^"]*)"/g)].map((item) => [item[1], item[2]]));
    const scale = attributes.scale as ScaleMode;
    const defaults = defaultAdvancedVideo();
    presets.push({
      name: xmlUnescape(match[1]),
      description: xmlUnescape(tag(body, 'description') || match[1]),
      workflow: (tag(body, 'workflow') || 'video') as SavedPreset['workflow'],
      format: (tag(body, 'format') || 'mp4') as SavedPreset['format'],
      encoder: xmlUnescape(tag(body, 'encoder') || 'libx264'),
      encoderSpeed: Math.min(7, Math.max(1, Number(tag(body, 'encoderSpeed'))
        || Number((tag(body, 'encoderPreset') || '').replace(/^p/i, '')) || 4)),
      encoderTune: xmlUnescape(tag(body, 'encoderTune') || ''),
      encoderProfile: xmlUnescape(tag(body, 'encoderProfile') || ''),
      frameRate: presetFrameRateValue(tag(body, 'frameRate') || 'passthrough', 'frameRate'),
      quality: tag(body, 'quality') || '20',
      videoBitrate: tag(body, 'videoBitrate') || '0',
      maxRate: tag(body, 'maxRate') || '0',
      bufferMultiplier: tag(body, 'bufferMultiplier') === undefined
        ? 1 : Math.min(20, Math.max(0, Number(tag(body, 'bufferMultiplier')) || 0)),
      bufferSize: tag(body, 'bufferSize') || '0',
      deliveryMode: bool(tag(body, 'deliveryMode'), false),
      advancedVideo: {
        bFrames: bool(advanced.bFrames, defaults.bFrames),
        multipass: Math.min(2, Math.max(0, Number(advanced.multipass) || 0)) as AdvancedVideoSettings['multipass'],
        bRefMode: ['disabled', 'each', 'middle'].includes(advanced.bRefMode)
          ? advanced.bRefMode as AdvancedVideoSettings['bRefMode'] : defaults.bRefMode,
        adaptiveBFrames: bool(advanced.adaptiveBFrames, defaults.adaptiveBFrames),
        sceneCutDetection: bool(advanced.sceneCutDetection, defaults.sceneCutDetection),
        rcLookahead: Math.min(42, Math.max(0, Number(advanced.rcLookahead) || 0)),
        nonReferenceP: bool(advanced.nonReferenceP, defaults.nonReferenceP),
        spatialAq: Math.min(15, Math.max(0, Number(advanced.spatialAq) || 0)),
        temporalAq: bool(advanced.temporalAq, defaults.temporalAq),
      },
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
        dynamicRangeCompression: bool(attributes.dynamicRangeCompression, true),
        resampleLosslessTo48k: bool(attributes.resampleLosslessTo48k, true),
        normalizeAudio: bool(attributes.normalizeAudio, true),
      },
    });
  }
  return presets;
};

const serializePreset = (preset: SavedPreset, indent: string) => `${indent}<preset name="${xmlEscape(preset.name)}">
${indent}  <description>${xmlEscape(preset.description)}</description>
${indent}  <workflow>${preset.workflow ?? 'video'}</workflow>
${indent}  <format>${preset.format}</format>
${indent}  <encoder>${xmlEscape(preset.encoder)}</encoder>
${indent}  <encoderSpeed>${preset.encoderSpeed}</encoderSpeed>
${indent}  <encoderTune>${xmlEscape(preset.encoderTune)}</encoderTune>
${indent}  <encoderProfile>${xmlEscape(preset.encoderProfile)}</encoderProfile>
${indent}  <frameRate>${preset.frameRate}</frameRate>
${indent}  <quality>${xmlEscape(preset.quality)}</quality>
${indent}  <videoBitrate>${xmlEscape(preset.videoBitrate)}</videoBitrate>
${indent}  <maxRate>${xmlEscape(preset.maxRate)}</maxRate>
${indent}  <bufferMultiplier>${preset.bufferMultiplier}</bufferMultiplier>
${indent}  <bufferSize>${xmlEscape(preset.bufferSize)}</bufferSize>
${indent}  <deliveryMode>${Number(preset.deliveryMode)}</deliveryMode>
${indent}  <advancedVideo bFrames="${Number(preset.advancedVideo.bFrames)}" multipass="${preset.advancedVideo.multipass}" bRefMode="${preset.advancedVideo.bRefMode}" adaptiveBFrames="${Number(preset.advancedVideo.adaptiveBFrames)}" sceneCutDetection="${Number(preset.advancedVideo.sceneCutDetection)}" rcLookahead="${preset.advancedVideo.rcLookahead}" nonReferenceP="${Number(preset.advancedVideo.nonReferenceP)}" spatialAq="${preset.advancedVideo.spatialAq}" temporalAq="${Number(preset.advancedVideo.temporalAq)}" />
${indent}  <audioCodec>${preset.audioCodec}</audioCodec>
${indent}  <audioBitrate>${xmlEscape(preset.audioBitrate)}</audioBitrate>
${indent}  <filters autoCrop="${Number(preset.filters.autoCrop)}" toneMapHdrToSdr="${Number(preset.filters.toneMapHdrToSdr)}" pixelFormat10Bit="${Number(preset.filters.pixelFormat10Bit)}" scale="${preset.filters.scale}" scaleLocked="${Number(preset.filters.scaleLocked)}" doNotReplaceAudio="${Number(preset.filters.doNotReplaceAudio)}" extractClosedCaptions="${Number(preset.filters.extractClosedCaptions)}" downmixToStereo="${Number(preset.filters.downmixToStereo)}" dynamicRangeCompression="${Number(preset.filters.dynamicRangeCompression)}" resampleLosslessTo48k="${Number(preset.filters.resampleLosslessTo48k)}" normalizeAudio="${Number(preset.filters.normalizeAudio)}" />
${indent}</preset>`;

const serialize = (settings: AppSettings) => `<?xml version="1.0" encoding="UTF-8"?>
<eaMediaToolsSettings version="11">
  <hardwareAcceleration>${Number(settings.hardwareAcceleration)}</hardwareAcceleration>
  <useStableFfmpeg>${Number(settings.useStableFfmpeg)}</useStableFfmpeg>
  <simultaneousEncoding>${Number(settings.simultaneousEncoding)}</simultaneousEncoding>
  <smartFileNaming>${Number(settings.smartFileNaming)}</smartFileNaming>
  <lastPreset>${xmlEscape(settings.lastPreset)}</lastPreset>
  <lastSourceDirectory>${xmlEscape(settings.lastSourceDirectory)}</lastSourceDirectory>
  <separateAudioDirectory>${Number(settings.separateAudioDirectory)}</separateAudioDirectory>
  <predefinedPresets source="presets.ini" />
  <workingPreset>
${settings.workingPreset ? serializePreset(settings.workingPreset, '    ') : ''}
  </workingPreset>
</eaMediaToolsSettings>
`;

const configPath = () => path.join(app.getPath('userData'), 'config');

export const loadSettings = async (): Promise<AppSettings> => {
  try {
    const xml = await fs.promises.readFile(configPath(), 'utf8');
    return {
      hardwareAcceleration: bool(tag(xml, 'hardwareAcceleration'), true),
      useStableFfmpeg: bool(tag(xml, 'useStableFfmpeg'), true),
      simultaneousEncoding: bool(tag(xml, 'simultaneousEncoding'), true),
      smartFileNaming: bool(tag(xml, 'smartFileNaming'), true),
      lastPreset: xmlUnescape(tag(xml, 'lastPreset') || 'Streaming'),
      lastSourceDirectory: xmlUnescape(tag(xml, 'lastSourceDirectory') || ''),
      customPresets: [],
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
