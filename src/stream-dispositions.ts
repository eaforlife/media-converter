import type { StreamFlags } from './shared-types.ts';

type DispositionSetting = { flags: StreamFlags; enabled?: boolean };

const activeSettings = (record: Record<number, DispositionSetting>) =>
  Object.values(record).filter((setting) => setting.enabled !== false);

export const consolidatePrimaryDispositions = (record: Record<number, DispositionSetting>) => {
  const active = activeSettings(record);
  for (const flag of ['default', 'forced'] as const) {
    const anchor = active.find((setting) => setting.flags[flag]);
    Object.values(record).forEach((setting) => { setting.flags[flag] = false; });
    if (anchor) anchor.flags[flag] = true;
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
  Object.values(record).forEach((setting) => { setting.flags[flag] = false; });
  selected.flags[flag] = true;
};
