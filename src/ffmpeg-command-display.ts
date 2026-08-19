const displayArgument = (value: string) => /^[A-Za-z0-9_./:@=+\\-]+$/.test(value)
  ? value
  : `"${value.replace(/"/g, '\\"')}"`;

export const formatSessionFfmpegCommand = (command: string[]) => {
  if (!command.length) return '';
  const displayCommand = [...command];
  displayCommand[0] = 'ffmpeg';
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
