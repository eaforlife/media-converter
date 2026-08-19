export const APP_RELEASES_URL = 'https://github.com/eaforlife/media-converter/releases';
export const ELECTRON_UPDATE_HOST = 'https://update.electronjs.org';

export const electronUpdateFeedUrl = (
  repository: string,
  platform: NodeJS.Platform,
  arch: string,
  version: string,
) => `${ELECTRON_UPDATE_HOST}/${repository}/${platform}-${arch}/${version}`;

export const shouldInitializeAppUpdater = (platform: NodeJS.Platform, arch: string) =>
  platform === 'win32' && arch === 'x64';

export const manualUpdateUnavailableMessage = (platform: NodeJS.Platform, arch: string) => {
  if (platform === 'linux') {
    return 'Updates on Linux are provided through the installed package manager.';
  }
  if (platform === 'win32' && arch !== 'x64') {
    return `Automatic updates are not available for Windows ${arch}. Download the latest installer from ${APP_RELEASES_URL}.`;
  }
  if (platform === 'darwin') {
    return `Automatic updates require a signed macOS build. Download the latest ZIP from ${APP_RELEASES_URL}.`;
  }
  if (platform !== 'win32') {
    return `Automatic updates are not available on this platform. Download the latest build from ${APP_RELEASES_URL}.`;
  }
  return null;
};

export const friendlyUpdateError = (message: string) => {
  if (/\b404\b|\(404\)\s+Not Found/i.test(message)) {
    return `The update service could not find the release feed. Download the latest installer from ${APP_RELEASES_URL}.`;
  }
  const firstUsefulLine = message.split(/\r?\n/).find((line) => line.trim() && !/^Command failed:/i.test(line));
  return firstUsefulLine?.trim() || 'The update service returned an unknown error.';
};
