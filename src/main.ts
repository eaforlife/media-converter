import { app, autoUpdater, BrowserWindow, dialog, ipcMain, net, shell } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import { APP_NAME, APP_UPDATE_REPOSITORY } from './config';
import {
  electronUpdateFeedUrl, friendlyUpdateError, isUpdateCheckAlreadyRunningError,
  manualUpdateUnavailableMessage, releaseChangelogUrl, shouldInitializeAppUpdater, UpdateCheckState,
} from './app-update';
import { initializeLogger, logActivity, readLog, rotateLogForUpdate } from './app-logger';
import { detectHardwareCapabilities } from './hardware-capabilities';
import { cancelEncoding, cancelEncodingAndWait, startEncodeQueue } from './encode-runner';
import { analyzeVisual, cleanupPreviews, initializePreviewStorage, releasePreviews } from './media-analysis';
import { probeMedia } from './media-probe';
import { initializeRuntime } from './runtime-manager';
import { loadSettings, readConfig, saveSettings } from './settings-store';
import type { AppSettings, EncodeJob, HardwareCapabilities, RuntimeState, SourceFile } from './shared-types';

const runSquirrel = (args: string[]) => {
  const updateExe = path.resolve(path.dirname(process.execPath), '..', 'Update.exe');
  const child = spawn(updateExe, args, { detached: true, windowsHide: true });
  child.on('close', () => app.quit());
};

const handleSquirrelEvent = () => {
  if (process.platform !== 'win32') return false;
  const event = process.argv[1];
  const target = path.basename(process.execPath);
  if (event === '--squirrel-install') {
    runSquirrel([`--createShortcut=${target}`]);
    return true;
  }
  if (event === '--squirrel-updated') {
    void rotateLogForUpdate(app.getVersion()).finally(() => runSquirrel([`--createShortcut=${target}`]));
    return true;
  }
  if (event === '--squirrel-uninstall') {
    void (async () => {
      const cleanupTargets = new Set([app.getPath('userData'), app.getPath('sessionData')]);
      await cleanupPreviews().catch(() => undefined);
      await Promise.all([...cleanupTargets].map((targetPath) =>
        fs.promises.rm(targetPath, { recursive: true, force: true }).catch(() => undefined)));
      runSquirrel([`--removeShortcut=${target}`]);
    })();
    return true;
  }
  if (event === '--squirrel-obsolete') {
    app.quit();
    return true;
  }
  return false;
};

const handlingSquirrelEvent = handleSquirrelEvent();

const VIDEO_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.mpg', '.mpeg', '.wmv',
  '.flv', '.ts', '.mts', '.m2ts', '.vob', '.ogv', '.3gp', '.3g2',
]);

let runtimeState: RuntimeState | null = null;
let hardwareCheck: Promise<HardwareCapabilities> | null = null;
let manualUpdateCheck: Promise<string> | null = null;
const updateCheckState = new UpdateCheckState();
autoUpdater.on('checking-for-update', () => updateCheckState.markChecking());
autoUpdater.on('update-available', () => updateCheckState.markDownloading());
autoUpdater.on('update-not-available', () => updateCheckState.markIdle());
autoUpdater.on('update-downloaded', () => updateCheckState.markDownloaded());
autoUpdater.on('error', () => updateCheckState.markIdle());
const developmentFfmpeg = () => process.env.EA_FFMPEG_PATH || (process.platform === 'win32' ? 'jellyffmpeg' : 'ffmpeg');
const developmentFfprobe = () => process.env.EA_FFPROBE_PATH || 'ffprobe';
const activeFfmpeg = () => runtimeState?.ffmpegPath || developmentFfmpeg();
const activeFfprobe = () => runtimeState?.ffprobePath || developmentFfprobe();

let startupUpdateCheck: Promise<void> | null = null;
const initializeStartupAppUpdate = (webContents: Electron.WebContents) => {
  if (startupUpdateCheck) return startupUpdateCheck;
  if (!app.isPackaged || !shouldInitializeAppUpdater(process.platform, process.arch)) {
    if (app.isPackaged) {
      logActivity('INFO', 'update.disabled', {
        reason: manualUpdateUnavailableMessage(process.platform, process.arch),
      });
    }
    startupUpdateCheck = Promise.resolve();
    return startupUpdateCheck;
  }

  const feedUrl = electronUpdateFeedUrl(
    APP_UPDATE_REPOSITORY,
    process.platform,
    process.arch,
    app.getVersion(),
  );
  logActivity('INFO', 'update.configured', { feedUrl });
  const notify = (message: string, phase: RuntimeState['phase'] = 'checking-release') => {
    logActivity('INFO', 'update.startup.progress', { phase, message });
    if (webContents.isDestroyed()) return;
    webContents.send('runtime:progress', {
      phase,
      message,
      progress: null,
      appVersion: app.getVersion(),
      isPackaged: app.isPackaged,
      updateEnabled: true,
      ffmpegAvailable: false,
      ffmpegPath: activeFfmpeg(),
      ffprobePath: activeFfprobe(),
      ffmpegVersion: null,
      releaseTag: null,
    } satisfies RuntimeState);
  };

  startupUpdateCheck = new Promise<void>((resolve) => {
    let settled = false;
    const cleanup = () => {
      clearTimeout(timeout);
      autoUpdater.removeListener('checking-for-update', onChecking);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('update-downloaded', onDownloaded);
      autoUpdater.removeListener('error', onError);
    };
    const finish = (message: string, delayMs: number, phase: RuntimeState['phase'] = 'checking-release') => {
      if (settled) return;
      settled = true;
      notify(message, phase);
      cleanup();
      setTimeout(resolve, delayMs);
    };
    const onChecking = () => notify('Checking for EA Media Tools updates');
    const onAvailable = () => {
      clearTimeout(timeout);
      notify('A new version is available · downloading the update', 'downloading');
    };
    const onNotAvailable = () => finish(
      `EA Media Tools ${app.getVersion()} is up to date`,
      500,
    );
    const onDownloaded = () => notify('Update downloaded · waiting for restart confirmation', 'verifying');
    const onError = (error: Error) => {
      if (isUpdateCheckAlreadyRunningError(error.message)) {
        updateCheckState.markChecking();
        notify('An update check is already running · waiting for its result');
        return;
      }
      finish(`Update check failed · ${friendlyUpdateError(error.message)}`, 900, 'error');
    };

    autoUpdater.on('checking-for-update', onChecking);
    autoUpdater.on('update-available', onAvailable);
    autoUpdater.on('update-not-available', onNotAvailable);
    autoUpdater.on('update-downloaded', onDownloaded);
    autoUpdater.on('error', onError);
    const timeout = setTimeout(() => finish(
      'Update check timed out · continuing with the installed version',
      900,
      'error',
    ), 30_000);
    notify('Preparing the application update service');

    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: APP_UPDATE_REPOSITORY,
      },
      updateInterval: '1 hour',
      notifyUser: true,
      onNotifyUser: (info) => {
        void (async () => {
          const owner = BrowserWindow.fromWebContents(webContents);
          const options: Electron.MessageBoxOptions = {
            type: 'info',
            buttons: ['Restart and update', 'Later'],
            defaultId: 0,
            cancelId: 1,
            title: 'EA Media Tools Update',
            message: `${info.releaseName || 'A new version'} is ready to install`,
            detail: 'Restart EA Media Tools now to finish installing the update.',
          };
          const result = owner
            ? await dialog.showMessageBox(owner, options)
            : await dialog.showMessageBox(options);
          if (result.response === 0) {
            logActivity('INFO', 'update.startup.restart-requested', { releaseName: info.releaseName });
            finish('Restarting to install the update', 0, 'verifying');
            autoUpdater.quitAndInstall();
            return;
          }
          logActivity('INFO', 'update.startup.deferred', { releaseName: info.releaseName });
          finish('Update ready · it will install when the app restarts', 500, 'ready');
        })().catch((error: unknown) => finish(
          `Unable to show the update prompt · ${error instanceof Error ? error.message : String(error)}`,
          900,
          'error',
        ));
      },
    });
  });
  return startupUpdateCheck;
};

const toSourceFile = (filePath: string): SourceFile | null => {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile() || !VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return null;
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      extension: path.extname(filePath).slice(1).toUpperCase() || 'MEDIA',
      media: null,
    };
  } catch {
    return null;
  }
};

const inspectSource = async (file: SourceFile): Promise<SourceFile | null> => {
  const ffprobePath = activeFfprobe();
  const ffmpegPath = activeFfmpeg();
  if (!ffprobePath) {
    return { ...file, probeError: 'FFprobe is not available' };
  }
  try {
    const media = await probeMedia(ffprobePath, file.path);
    if (!media.video) return null;
    const preview = ffmpegPath ? await analyzeVisual(ffmpegPath, file.path, media) : {};
    logActivity('INFO', 'ffprobe.output', {
      path: file.path,
      format: media.format,
      duration: media.duration,
      video: media.video,
      audioTracks: media.audio,
      subtitleTracks: media.subtitles,
      chapters: media.chapterCount,
    });
    logActivity('INFO', 'ffmpeg.visual-analysis.output', {
      path: file.path,
      suggestedCrop: media.suggestedCrop,
      previewCreated: 'previewId' in preview && Boolean(preview.previewId),
    });
    return { ...file, media, ...preview };
  } catch (error) {
    logActivity('ERROR', 'ffprobe.error', {
      path: file.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...file,
      probeError: error instanceof Error ? error.message : 'Unable to inspect this video',
    };
  }
};

const inspectSources = async (files: SourceFile[]) => {
  const inspected = new Array<SourceFile | null>(files.length).fill(null);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < files.length) {
      const index = nextIndex;
      nextIndex += 1;
      inspected[index] = await inspectSource(files[index]);
    }
  };
  const workerCount = Math.min(2, files.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return inspected.filter((file): file is SourceFile => file !== null);
};

const checkForAppUpdate = () => {
  if (!app.isPackaged) return Promise.resolve('Update checks are available in installed builds.');
  const unavailableMessage = manualUpdateUnavailableMessage(process.platform, process.arch);
  if (unavailableMessage) return Promise.resolve(unavailableMessage);
  if (manualUpdateCheck) return manualUpdateCheck;
  if (updateCheckState.phase === 'downloading') {
    return Promise.resolve('An update is available and is downloading in the background.');
  }
  if (updateCheckState.phase === 'downloaded') {
    return Promise.resolve('An update has downloaded and is ready to install when the app restarts.');
  }

  const shouldStartCheck = updateCheckState.reserveCheck();

  const check = new Promise<string>((resolve) => {
    const finish = (message: string, level: 'INFO' | 'ERROR', event: string) => {
      clearTimeout(timeout);
      autoUpdater.removeListener('update-available', onAvailable);
      autoUpdater.removeListener('update-not-available', onNotAvailable);
      autoUpdater.removeListener('error', onError);
      logActivity(level, event, { version: app.getVersion(), message });
      resolve(message);
    };
    const onAvailable = () => finish(
      'An update is available and is downloading in the background.',
      'INFO',
      'update.manual-check.available',
    );
    const onNotAvailable = () => {
      updateCheckState.markIdle();
      finish(
        `EA Media Tools ${app.getVersion()} is up to date.`,
        'INFO',
        'update.manual-check.current',
      );
    };
    const onError = (error: Error) => {
      if (isUpdateCheckAlreadyRunningError(error.message)) {
        updateCheckState.markChecking();
        logActivity('INFO', 'update.manual-check.joined', { version: app.getVersion() });
        return;
      }
      updateCheckState.markIdle();
      finish(
        `Update check failed: ${friendlyUpdateError(error.message)}`,
        'ERROR',
        'update.manual-check.failed',
      );
    };
    const timeout = setTimeout(() => finish(
      'The update check timed out. Please try again.',
      'ERROR',
      'update.manual-check.timed-out',
    ), 30_000);
    autoUpdater.once('update-available', onAvailable);
    autoUpdater.once('update-not-available', onNotAvailable);
    autoUpdater.on('error', onError);
    if (!shouldStartCheck) {
      logActivity('INFO', 'update.manual-check.joined', { version: app.getVersion() });
      return;
    }
    try {
      autoUpdater.checkForUpdates();
      logActivity('INFO', 'update.manual-check.started');
    } catch (error) {
      const updateError = error instanceof Error ? error : new Error(String(error));
      if (isUpdateCheckAlreadyRunningError(updateError.message)) {
        updateCheckState.markChecking();
        logActivity('INFO', 'update.manual-check.joined', { version: app.getVersion() });
      } else {
        onError(updateError);
      }
    }
  });
  manualUpdateCheck = check.finally(() => { manualUpdateCheck = null; });
  return manualUpdateCheck;
};

const readInstalledReleaseChangelog = async () => {
  const version = app.getVersion();
  const url = releaseChangelogUrl(APP_UPDATE_REPOSITORY, version);
  logActivity('INFO', 'changelog.read.started', { version, url });
  try {
    const response = await net.fetch(url, {
      headers: {
        Accept: 'application/vnd.github+json',
        'User-Agent': `${APP_NAME.replace(/\s+/g, '-')}/${version}`,
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });
    if (!response.ok) throw new Error(`GitHub returned ${response.status} ${response.statusText}`);
    const release = await response.json() as {
      body?: string | null;
      html_url?: string;
      name?: string | null;
      tag_name?: string;
    };
    const heading = release.name?.trim() || release.tag_name || `EA Media Tools v${version}`;
    const notes = release.body?.trim() || 'This release does not include written change notes.';
    logActivity('INFO', 'changelog.read.completed', { version });
    return `${heading}\n${release.html_url ?? url}\n\n${notes}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logActivity('ERROR', 'changelog.read.failed', { version, message });
    return `Unable to load the change log for EA Media Tools v${version}.\n\n${message}\n\nRelease page: https://github.com/${APP_UPDATE_REPOSITORY}/releases/tag/v${version}`;
  }
};

const registerIpc = () => {
  ipcMain.handle('runtime:initialize', async (event) => {
    await initializeStartupAppUpdate(event.sender);
    runtimeState = await initializeRuntime(event.sender);
    logActivity('INFO', 'runtime.initialized', runtimeState);
    return runtimeState;
  });

  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.handle('settings:save', (_event, settings: AppSettings) => saveSettings(settings));
  ipcMain.handle('source:release-previews', (_event, ids: string[]) => releasePreviews(ids));
  ipcMain.handle('hardware:detect', () => {
    const ffmpegPath = activeFfmpeg();
    if (!ffmpegPath) throw new Error('FFmpeg is unavailable for hardware capability checks');
    hardwareCheck ??= detectHardwareCapabilities(ffmpegPath);
    return hardwareCheck;
  });
  ipcMain.handle('log:read', () => readLog());
  ipcMain.handle('config:read', (_event, settings?: AppSettings) => readConfig(settings));
  ipcMain.handle('window:minimize', (event) => BrowserWindow.fromWebContents(event.sender)?.minimize());
  ipcMain.handle('window:close', (event) => BrowserWindow.fromWebContents(event.sender)?.close());
  ipcMain.handle('app:finish-and-close', async () => {
    logActivity('INFO', 'app.done.requested');
    await cancelEncodingAndWait();
    app.quit();
  });
  ipcMain.handle('app:check-update', () => checkForAppUpdate());
  ipcMain.handle('app:read-changelog', () => readInstalledReleaseChangelog());

  ipcMain.handle('source:open-file', async (event, initialDirectory?: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Open one or more video files',
      defaultPath: initialDirectory || undefined,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Video files', extensions: Array.from(VIDEO_EXTENSIONS, (ext) => ext.slice(1)) },
      ],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    logActivity('INFO', 'source.file-selection', { count: result.filePaths.length });
    const files = result.filePaths.map(toSourceFile).filter((file): file is SourceFile => file !== null);
    return inspectSources(files);
  });

  ipcMain.handle('source:open-folder', async (event, initialDirectory?: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Open a video folder',
      defaultPath: initialDirectory || undefined,
      properties: ['openDirectory'],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return [];
    logActivity('INFO', 'source.folder-selection', { path: result.filePaths[0] });

    try {
      const files = fs.readdirSync(result.filePaths[0], { withFileTypes: true })
        .filter((entry) => entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => toSourceFile(path.join(result.filePaths[0], entry.name)))
        .filter((file): file is SourceFile => file !== null);
      return inspectSources(files);
    } catch {
      return [];
    }
  });

  ipcMain.handle('output:choose-directory', async (event, defaultPath: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Choose output folder',
      defaultPath: defaultPath || undefined,
      properties: ['openDirectory', 'createDirectory'],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    return result.canceled ? null : result.filePaths[0] ?? null;
  });
  ipcMain.handle('encode:start', (event, jobs: EncodeJob[]) => {
    const ffmpegPath = activeFfmpeg();
    return startEncodeQueue(ffmpegPath, jobs, event.sender);
  });
  ipcMain.handle('encode:cancel', (_event, jobIndex?: number) => cancelEncoding(jobIndex));

  ipcMain.handle('output:prepare-directory', async (_event, directoryPath: string) => {
    if (!directoryPath || !path.isAbsolute(directoryPath)) return false;
    try {
      await fs.promises.mkdir(directoryPath, { recursive: true });
      logActivity('INFO', 'output.directory.ready', { path: directoryPath });
      return true;
    } catch (error) {
      logActivity('ERROR', 'output.directory.failed', {
        path: directoryPath,
        error: error instanceof Error ? error.message : String(error),
      });
      return false;
    }
  });

  ipcMain.handle('path:show', async (_event, targetPath: string) => {
    if (targetPath) shell.showItemInFolder(targetPath);
  });
};

const createWindow = () => {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1060,
    minHeight: 700,
    backgroundColor: '#0b0d12',
    title: APP_NAME,
    frame: false,
    resizable: false,
    maximizable: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

if (!handlingSquirrelEvent) app.whenReady().then(async () => {
  await initializeLogger();
  logActivity('INFO', 'application.started', { version: app.getVersion(), packaged: app.isPackaged });
  await initializePreviewStorage();
  registerIpc();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

let cleaningUp = false;
app.on('before-quit', (event) => {
  if (handlingSquirrelEvent || cleaningUp) return;
  cleaningUp = true;
  event.preventDefault();
  void Promise.all([cancelEncodingAndWait(), cleanupPreviews()]).finally(() => app.exit(0));
});
