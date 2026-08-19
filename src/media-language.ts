export const MEDIA_LANGUAGES = [
  ['und', 'Unknown'], ['eng', 'English'], ['ara', 'Arabic'], ['bul', 'Bulgarian'],
  ['zho', 'Chinese'], ['ces', 'Czech'], ['dan', 'Danish'], ['nld', 'Dutch'],
  ['est', 'Estonian'], ['fin', 'Finnish'], ['fra', 'French'], ['deu', 'German'],
  ['ell', 'Greek'], ['heb', 'Hebrew'], ['hin', 'Hindi'], ['hun', 'Hungarian'],
  ['ind', 'Indonesian'], ['ita', 'Italian'], ['jpn', 'Japanese'], ['kor', 'Korean'],
  ['lav', 'Latvian'], ['lit', 'Lithuanian'], ['msa', 'Malay'], ['nor', 'Norwegian'],
  ['pol', 'Polish'], ['por', 'Portuguese'], ['ron', 'Romanian'], ['rus', 'Russian'],
  ['slk', 'Slovak'], ['slv', 'Slovenian'], ['spa', 'Spanish'], ['swe', 'Swedish'],
  ['tam', 'Tamil'], ['tel', 'Telugu'], ['tha', 'Thai'], ['tur', 'Turkish'],
  ['ukr', 'Ukrainian'], ['vie', 'Vietnamese'],
] as const;

const LANGUAGE_NAMES = new Map<string, string>([
  ...MEDIA_LANGUAGES,
  ['en', 'English'], ['es', 'Spanish'], ['fre', 'French'], ['fr', 'French'],
  ['ger', 'German'], ['de', 'German'], ['it', 'Italian'], ['pt', 'Portuguese'],
  ['ja', 'Japanese'], ['ko', 'Korean'], ['chi', 'Chinese'], ['zh', 'Chinese'],
  ['ru', 'Russian'], ['ar', 'Arabic'], ['hi', 'Hindi'], ['cze', 'Czech'],
  ['dut', 'Dutch'], ['gre', 'Greek'], ['may', 'Malay'], ['slo', 'Slovak'],
]);

export const normalizeMediaLanguage = (language?: string) =>
  (language || 'und').trim().toLowerCase() || 'und';

export const mediaLanguageName = (language?: string) => {
  const normalized = normalizeMediaLanguage(language);
  return LANGUAGE_NAMES.get(normalized) ?? normalized.toUpperCase();
};

export const mediaLanguageOptions = (currentLanguage: string) => {
  const current = normalizeMediaLanguage(currentLanguage);
  return MEDIA_LANGUAGES.some(([code]) => code === current)
    ? MEDIA_LANGUAGES
    : [[current, mediaLanguageName(current)] as const, ...MEDIA_LANGUAGES];
};
