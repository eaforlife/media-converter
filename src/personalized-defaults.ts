import type { AppSettings } from './shared-types';

export type PersonalizedDefaults = Omit<AppSettings, 'customPresets'>;

export const DEFAULT_PERSONALIZED_DEFAULTS: PersonalizedDefaults = {
  hardwareAcceleration: true,
  useStableFfmpeg: true,
  simultaneousEncoding: true,
  smartFileNaming: true,
  lastPreset: 'Streaming',
  lastSourceDirectory: '',
  workingPreset: null,
  separateAudioDirectory: true,
};

export const parsePersonalizedDefaults = (section: Map<string, string> | undefined): PersonalizedDefaults => {
  if (!section) return structuredClone(DEFAULT_PERSONALIZED_DEFAULTS);
  const tag = section.get('defaults_tag');
  if (tag !== '1') throw new Error('[Personalized Defaults] defaults_tag must be 1');
  const raw = section.get('settings_json');
  if (!raw) throw new Error('[Personalized Defaults] is missing settings_json');
  let value: unknown;
  try { value = JSON.parse(Buffer.from(raw, 'base64').toString('utf8')); }
  catch { throw new Error('[Personalized Defaults] settings_json must be base64 encoded JSON'); }
  if (!value || typeof value !== 'object') throw new Error('[Personalized Defaults] settings_json has an invalid shape');
  const settings = value as Partial<PersonalizedDefaults>;
  const workingPreset = settings.workingPreset;
  const validPreset = workingPreset === null || Boolean(workingPreset && typeof workingPreset === 'object'
    && !Array.isArray(workingPreset)
    && typeof workingPreset.name === 'string'
    && typeof workingPreset.encoder === 'string'
    && typeof workingPreset.format === 'string'
    && typeof workingPreset.advancedVideo === 'object'
    && typeof workingPreset.filters === 'object');
  if (typeof settings.hardwareAcceleration !== 'boolean'
    || typeof settings.useStableFfmpeg !== 'boolean'
    || typeof settings.simultaneousEncoding !== 'boolean'
    || typeof settings.smartFileNaming !== 'boolean'
    || typeof settings.lastPreset !== 'string'
    || typeof settings.lastSourceDirectory !== 'string'
    || typeof settings.separateAudioDirectory !== 'boolean'
    || !validPreset) {
    throw new Error('[Personalized Defaults] settings_json has an invalid shape');
  }
  return settings as PersonalizedDefaults;
};

export const personalizedDefaultsSection = (settings: PersonalizedDefaults) => [
  '[Personalized Defaults]',
  'defaults_tag=1',
  `settings_json=${Buffer.from(JSON.stringify(settings), 'utf8').toString('base64')}`,
];

export const replacePersonalizedDefaults = (contents: string, settings: PersonalizedDefaults) => {
  const lines = contents.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n');
  const start = lines.findIndex((line) => line.trim() === '[Personalized Defaults]');
  if (start >= 0) {
    const next = lines.findIndex((line, index) => index > start && /^\s*\[[^\]]+\]\s*$/.test(line));
    lines.splice(start, (next < 0 ? lines.length : next) - start);
  }
  while (lines.length && !lines.at(-1)?.trim()) lines.pop();
  return `${lines.join('\n')}\n\n${personalizedDefaultsSection(settings).join('\n')}\n`;
};
