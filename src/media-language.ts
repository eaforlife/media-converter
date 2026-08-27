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

const LANGUAGE_NAMES = new Map<string, string>(MEDIA_LANGUAGES);
const LANGUAGE_ALIASES = new Map<string, string>([
  ['ar', 'ara'], ['bg', 'bul'], ['chi', 'zho'], ['zh', 'zho'], ['cze', 'ces'], ['cs', 'ces'],
  ['da', 'dan'], ['dut', 'nld'], ['nl', 'nld'], ['en', 'eng'], ['et', 'est'], ['fi', 'fin'],
  ['fr', 'fra'], ['fre', 'fra'], ['de', 'deu'], ['ger', 'deu'], ['el', 'ell'], ['gre', 'ell'],
  ['he', 'heb'], ['hi', 'hin'], ['hu', 'hun'], ['id', 'ind'], ['it', 'ita'], ['ja', 'jpn'],
  ['ko', 'kor'], ['lv', 'lav'], ['lt', 'lit'], ['may', 'msa'], ['ms', 'msa'], ['no', 'nor'],
  ['pl', 'pol'], ['pt', 'por'], ['ro', 'ron'], ['ru', 'rus'], ['sk', 'slk'], ['slo', 'slk'],
  ['sl', 'slv'], ['es', 'spa'], ['sv', 'swe'], ['ta', 'tam'], ['te', 'tel'], ['th', 'tha'],
  ['tr', 'tur'], ['uk', 'ukr'], ['vi', 'vie'],
]);

export const normalizeMediaLanguage = (language?: string) => {
  const normalized = (language || 'und').trim().toLowerCase() || 'und';
  return LANGUAGE_ALIASES.get(normalized) ?? normalized;
};

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
