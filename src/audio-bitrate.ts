const kbpsValue = (bitrate: string) => {
  const match = /^(\d+)k$/i.exec(bitrate.trim());
  if (!match) throw new Error(`Invalid audio bitrate: ${bitrate}`);
  return Number(match[1]);
};

export const bitrateForChannels = (stereoBitrate: string, channels: number) => {
  if (!Number.isInteger(channels) || channels < 1 || channels > 32) {
    throw new Error('Audio channel count must be an integer from 1 to 32');
  }
  return `${Math.round(kbpsValue(stereoBitrate) * channels / 2)}k`;
};

export const needsMultichannelAac = (channels: number, downmixToStereo: boolean) =>
  channels > 2 && !downmixToStereo;

export const maxAudioChannels = (channelCounts: readonly number[]) => Math.max(0, ...channelCounts);

export const multichannelAacBitrateOptions = (stereoBitrateOptions: readonly string[], channels: number) => {
  if (!Number.isInteger(channels) || channels <= 2) {
    throw new Error('Multichannel AAC bitrate options require more than two channels');
  }
  return [...new Set(stereoBitrateOptions.map((bitrate) => bitrateForChannels(bitrate, channels)))];
};

export const closestBitrateOption = (targetBitrate: string, options: readonly string[]) => {
  if (!options.length) throw new Error('At least one bitrate option is required');
  const target = kbpsValue(targetBitrate);
  return options.reduce((closest, candidate) =>
    Math.abs(kbpsValue(candidate) - target) < Math.abs(kbpsValue(closest) - target) ? candidate : closest);
};
