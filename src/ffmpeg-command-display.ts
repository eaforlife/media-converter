const displayArgument = (value: string) => /^[A-Za-z0-9_./:@=+\\-]+$/.test(value)
  ? value
  : `"${value.replace(/"/g, '\\"')}"`;

export const formatSessionFfmpegCommand = (command: string[]) => {
  if (!command.length) return '';
  const displayCommand = [...command];
  const executable = command[0].split(/[\\/]/).at(-1)?.replace(/\.exe$/i, '') ?? 'ffmpeg';
  const isRsgain = /^rsgain$/i.test(executable);
  displayCommand[0] = isRsgain ? 'rsgain' : 'ffmpeg';
  if (isRsgain) {
    if (displayCommand.length > 1) displayCommand[displayCommand.length - 1] = '<library>';
    return displayCommand.map((argument) => argument === '<library>'
      ? argument
      : displayArgument(argument)).join(' ');
  }
  for (let index = 1; index < displayCommand.length - 1; index += 1) {
    if (displayCommand[index] === '-i' && displayCommand[index + 1]) {
      displayCommand[index + 1] = '<input>';
      index += 1;
    }
  }
  if (displayCommand.length > 1) displayCommand[displayCommand.length - 1] = '<output>';
  return displayCommand.map((argument) => argument === '<input>' || argument === '<output>'
    ? argument
    : displayArgument(argument)).join(' ');
};
