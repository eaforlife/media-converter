export const shouldDisableUiHardwareAcceleration = (platform: NodeJS.Platform) => platform === 'win32';

export const shouldInvalidateUiAfterInputType = (inputType: string) =>
  inputType === 'checkbox' || inputType === 'radio';

export const uiRenderingCommandLineSwitches = (platform: NodeJS.Platform): readonly string[] =>
  platform === 'win32'
    ? ['disable-gpu-compositing', 'disable-direct-composition']
    : [];
