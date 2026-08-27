import type { StreamFlags } from './shared-types.ts';

type DispositionSetting = { flags: StreamFlags; enabled?: boolean };

const activeSettings = (record: Record<number, DispositionSetting>) =>
  Object.values(record).filter((setting) => setting.enabled !== false);

export const consolidatePrimaryDispositions = (record: Record<number, DispositionSetting>) => {
  const active = activeSettings(record);
  const anchor = active.find((setting) => setting.flags.default || setting.flags.forced);
  const hasDefault = active.some((setting) => setting.flags.default);
  const hasForced = active.some((setting) => setting.flags.forced);
  Object.values(record).forEach((setting) => {
    setting.flags.default = false;
    setting.flags.forced = false;
  });
  if (anchor) {
    anchor.flags.default = hasDefault;
    anchor.flags.forced = hasForced;
  }
};

export const setPrimaryDisposition = (
  record: Record<number, DispositionSetting>,
  index: number,
  flag: keyof StreamFlags,
  checked: boolean,
) => {
  const selected = record[index];
  if (!selected) return;
  if (flag === 'hearingImpaired') {
    selected.flags.hearingImpaired = checked;
    return;
  }
  if (!checked) {
    selected.flags[flag] = false;
    return;
  }
  const inheritedFlag = flag === 'default' ? 'forced' : 'default';
  const inherit = activeSettings(record).some((setting) => setting.flags[inheritedFlag]);
  Object.values(record).forEach((setting) => {
    setting.flags.default = false;
    setting.flags.forced = false;
  });
  selected.flags[flag] = true;
  selected.flags[inheritedFlag] = inherit;
};
