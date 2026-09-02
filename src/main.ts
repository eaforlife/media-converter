import { app, autoUpdater, BrowserWindow, dialog, ipcMain, net, shell, type WebContents } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import { APP_NAME, APP_UPDATE_REPOSITORY } from './config';
import {
  APP_UPDATE_INTERVAL, electronUpdateFeedUrl, friendlyUpdateError, isUpdateCheckAlreadyRunningError,
  manualUpdateUnavailableMessage, releaseChangelogUrl, shouldInitializeAppUpdater, UpdateCheckState,
} from './app-update';
import { initializeLogger, logActivity, readLog, rotateLogForUpdate } from './app-logger';
import { cleanupPreviousInstall } from './install-cleanup';
import { detectHardwareCapabilities } from './hardware-capabilities';
import { cancelEncoding, cancelEncodingAndWait, isEncodingActive, startEncodeQueue } from './encode-runner';
import { analyzeVisual, cleanupPreviews, initializePreviewStorage, releasePreviews } from './media-analysis';
import { probeMedia } from './media-probe';
import { classifyMediaWorkflow } from './media-workflow';
import { initializeRuntime, selectRuntimeChannel } from './runtime-manager';
import { loadSettings, readConfig, saveSettings } from './settings-store';
import { loadBuiltInPresets, presetFilePath, readPresetFile } from './preset-store';
import { customPresetFilePath, loadCustomPresets, readCustomPresetFile, saveCustomPresets } from './custom-preset-store';
import {
  externalSubtitleTracks, importedSubtitleTracks, isSupportedExternalSubtitle, isUtf8SubtitleData,
  UTF8_SUBTITLE_EXTENSIONS,
} from './external-subtitles';
import { shouldDisableUiHardwareAcceleration } from './ui-rendering';
import { boundedMap, FILE_INDEX_LIMIT, inspectionConcurrency } from './source-scanning';
import type {
  AppSettings, EncodeJob, HardwareCapabilities, RuntimeState, SourceFile, SourceScanProgress, SubtitleImportResult,
} from './shared-types';

// Electron's UI compositor is independent of FFmpeg's CUDA/NVDEC/NVENC path.
// Software UI rendering avoids Windows GPU-driver resets that can blank the frameless window.
if (shouldDisableUiHardwareAcceleration(process.platform)) app.disableHardwareAcceleration();

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
    void Promise.all([
      rotateLogForUpdate(app.getVersion()),
      cleanupPreviousInstall(path.dirname(process.execPath)),
    ]).catch(() => undefined).finally(() => runSquirrel([`--createShortcut=${target}`]));
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
const AUDIO_EXTENSIONS = new Set([
  '.aac', '.ac3', '.aif', '.aiff', '.alac', '.ape', '.dts', '.eac3', '.flac', '.m4a',
  '.mka', '.mp3', '.oga', '.ogg', '.opus', '.tta', '.wav', '.wma', '.wv',
]);
const MEDIA_EXTENSIONS = new Set([...VIDEO_EXTENSIONS, ...AUDIO_EXTENSIONS]);

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
      ffmpegChannel: 'stable',
      rsgainAvailable: false,
      rsgainPath: '',
      rsgainVersion: null,
      ccextractorAvailable: false,
      ccextractorPath: '',
      ccextractorVersion: null,
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
    const onAvailable = () => finish(
      'A new version is available · downloading in the background',
      500,
      'downloading',
    );
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
      updateInterval: APP_UPDATE_INTERVAL,
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
            await cancelEncodingAndWait();
            await cleanupPreviews().catch(() => undefined);
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

const lyricFilesFor = async (filePath: string) => {
  const parsed = path.parse(filePath);
  const candidate = path.join(parsed.dir, `${parsed.name}.lrc`);
  return fs.promises.access(candidate).then(() => [candidate], () => [] as string[]);
};

const toSourceFile = async (filePath: string, sourceRoot?: string): Promise<SourceFile | null> => {
  try {
    const [stat, lyricPaths] = await Promise.all([fs.promises.stat(filePath), lyricFilesFor(filePath)]);
    if (!stat.isFile() || !MEDIA_EXTENSIONS.has(path.extname(filePath).toLowerCase())) return null;
    const resolvedRoot = sourceRoot ? path.resolve(sourceRoot) : path.dirname(path.resolve(filePath));
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      extension: path.extname(filePath).slice(1).toUpperCase() || 'MEDIA',
      media: null,
      sourceRoot: resolvedRoot,
      relativePath: path.relative(resolvedRoot, filePath),
      lyricPaths,
    };
  } catch {
    return null;
  }
};

const inspectSource = async (file: SourceFile, detailedLogging: boolean): Promise<SourceFile | null> => {
  const ffprobePath = activeFfprobe();
  const ffmpegPath = activeFfmpeg();
  if (!ffprobePath) {
    return { ...file, probeError: 'FFprobe is not available' };
  }
  try {
    const media = await probeMedia(ffprobePath, file.path);
    if (!media.video && !media.audio.length) return null;
    const workflow = classifyMediaWorkflow(media);
    if (!workflow) return null;
    const preview = media.video && ffmpegPath ? await analyzeVisual(ffmpegPath, file.path, media) : {};
    if (detailedLogging) {
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
    }
    return { ...file, media, workflow, ...preview };
  } catch (error) {
    logActivity('ERROR', 'ffprobe.error', {
      path: file.path,
      error: error instanceof Error ? error.message : String(error),
    });
    return {
      ...file,
      probeError: error instanceof Error ? error.message : 'Unable to inspect this media file',
    };
  }
};

const inspectSources = async (
  files: SourceFile[],
  onProgress?: (completed: number, total: number, file: SourceFile) => void,
) => {
  const audioOnly = files.every((file) => AUDIO_EXTENSIONS.has(path.extname(file.path).toLowerCase()));
  const concurrency = inspectionConcurrency(files.length, audioOnly, os.availableParallelism());
  const detailedLogging = files.length <= 100;
  logActivity('INFO', 'source.inspection.started', { files: files.length, audioOnly, concurrency });
  const inspected = await boundedMap(
    files, concurrency, (file) => inspectSource(file, detailedLogging), onProgress,
  );
  const valid = inspected.filter((file): file is SourceFile => file !== null);
  logActivity('INFO', 'source.inspection.completed', { requested: files.length, accepted: valid.length, concurrency });
  return valid;
};

const attachExternalSubtitles = (files: SourceFile[], subtitlePaths: readonly string[]) => files.map((file) => {
  if (!file.media?.video) return file;
  const nextIndex = Math.max(-1, ...file.media.subtitles.map((track) => track.index)) + 1;
  const external = externalSubtitleTracks(file.path, subtitlePaths, nextIndex);
  if (!external.length) return file;
  logActivity('INFO', 'source.external-subtitles.detected', {
    source: file.path,
    subtitles: external.map((track) => ({
      path: track.externalPath, language: track.language, flags: track.flags,
    })),
  });
  return { ...file, media: { ...file.media, subtitles: [...file.media.subtitles, ...external] } };
});

const readableUtf8SubtitlePaths = async (subtitlePaths: readonly string[]) => {
  const checkedPaths = await boundedMap(subtitlePaths, 16, async (subtitlePath) => {
    try {
      return isSupportedExternalSubtitle(subtitlePath) && isUtf8SubtitleData(await fs.promises.readFile(subtitlePath))
        ? subtitlePath
        : null;
    } catch {
      return null;
    }
  });
  return checkedPaths.filter((subtitlePath): subtitlePath is string => subtitlePath !== null);
};

const subtitlesBeside = async (filePaths: readonly string[]) => {
  const paths: string[] = [];
  await Promise.all([...new Set(filePaths.map((filePath) => path.dirname(filePath)))].map(async (directory) => {
    const entries = await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []);
    for (const entry of entries) {
      if (entry.isFile() && isSupportedExternalSubtitle(entry.name)) paths.push(path.join(directory, entry.name));
    }
  }));
  return readableUtf8SubtitlePaths(paths);
};

const keepOneWorkflow = (files: SourceFile[]) => {
  const workflow = files[0]?.workflow;
  return workflow ? files.filter((file) => file.workflow === workflow) : files;
};

const recursivelyFindMedia = async (root: string, onProgress?: (discovered: number) => void) => {
  const videos: string[] = [];
  const audio: string[] = [];
  const subtitles: string[] = [];
  const directories = [root];
  while (directories.length) {
    const batch = directories.splice(0, 16);
    const listings = await Promise.all(batch.map(async (directory) => ({
      directory,
      entries: await fs.promises.readdir(directory, { withFileTypes: true }).catch(() => []),
    })));
    for (const { directory, entries } of listings) {
      for (const entry of entries) {
        const fullPath = path.join(directory, entry.name);
        if (entry.isDirectory() && entry.name.toLowerCase() !== 'converted') directories.push(fullPath);
        else if (entry.isFile() && VIDEO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) videos.push(fullPath);
        else if (entry.isFile() && AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) audio.push(fullPath);
        else if (entry.isFile() && isSupportedExternalSubtitle(entry.name)) subtitles.push(fullPath);
      }
    }
    onProgress?.(videos.length + audio.length);
  }
  return { videos, audio, subtitles: await readableUtf8SubtitlePaths(subtitles) };
};

const emitSourceScanProgress = (webContents: WebContents, progress: SourceScanProgress) => {
  if (!webContents.isDestroyed()) webContents.send('source:scan-progress', progress);
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
  ipcMain.handle('app:initialize-update', (event) => initializeStartupAppUpdate(event.sender));
  ipcMain.handle('runtime:initialize', async (event, useStableFfmpeg?: boolean) => {
    runtimeState = await initializeRuntime(event.sender, useStableFfmpeg !== false);
    logActivity('INFO', 'runtime.initialized', runtimeState);
    return runtimeState;
  });
  ipcMain.handle('runtime:select-channel', async (_event, useStableFfmpeg: boolean) => {
    if (isEncodingActive()) throw new Error('FFmpeg cannot be changed while encoding is active');
    const selected = await selectRuntimeChannel(useStableFfmpeg);
    if (!selected.ffmpegAvailable) throw new Error(selected.message);
    runtimeState = selected;
    hardwareCheck = null;
    logActivity('INFO', 'runtime.channel.selected', {
      channel: runtimeState.ffmpegChannel,
      releaseTag: runtimeState.releaseTag,
      ffmpegVersion: runtimeState.ffmpegVersion,
    });
    return runtimeState;
  });

  ipcMain.handle('settings:load', () => loadSettings());
  ipcMain.handle('settings:save', (_event, settings: AppSettings) => saveSettings(settings));
  ipcMain.handle('presets:load', (event) => {
    if (!event.sender.isDestroyed()) event.sender.send('runtime:progress', {
      phase: 'verifying', message: 'Synchronizing preset defaults', progress: null,
      appVersion: app.getVersion(), isPackaged: app.isPackaged,
      updateEnabled: app.isPackaged && process.platform !== 'linux',
      ffmpegAvailable: false, ffmpegPath: activeFfmpeg(), ffprobePath: activeFfprobe(),
      ffmpegVersion: null, releaseTag: null, ffmpegChannel: 'stable',
      rsgainAvailable: false, rsgainPath: '', rsgainVersion: null,
      ccextractorAvailable: false, ccextractorPath: '', ccextractorVersion: null,
    } satisfies RuntimeState);
    return loadBuiltInPresets();
  });
  ipcMain.handle('presets:read', () => readPresetFile());
  ipcMain.handle('presets:show', () => shell.showItemInFolder(presetFilePath()));
  ipcMain.handle('custom-presets:load', () => loadCustomPresets());
  ipcMain.handle('custom-presets:save', (_event, presets) => saveCustomPresets(presets));
  ipcMain.handle('custom-presets:read', () => readCustomPresetFile());
  ipcMain.handle('custom-presets:show', () => {
    const destination = customPresetFilePath();
    if (!fs.existsSync(destination)) return false;
    shell.showItemInFolder(destination);
    return true;
  });
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
      title: 'Open one or more media files',
      defaultPath: initialDirectory || undefined,
      properties: ['openFile', 'multiSelections'],
      filters: [
        { name: 'Media files', extensions: Array.from(MEDIA_EXTENSIONS, (ext) => ext.slice(1)) },
      ],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return [];
    logActivity('INFO', 'source.file-selection', { count: result.filePaths.length });
    const indexed = await boundedMap(
      result.filePaths,
      FILE_INDEX_LIMIT,
      (filePath) => toSourceFile(filePath),
      (completed, total, filePath) => emitSourceScanProgress(event.sender, {
        phase: 'indexing', completed, total, currentName: path.basename(filePath),
      }),
    );
    const files = indexed.filter((file): file is SourceFile => file !== null);
    const inspected = keepOneWorkflow(await inspectSources(files, (completed, total, file) =>
      emitSourceScanProgress(event.sender, { phase: 'inspecting', completed, total, currentName: file.name })));
    return attachExternalSubtitles(inspected, await subtitlesBeside(result.filePaths));
  });

  ipcMain.handle('source:open-folder', async (event, initialDirectory?: string) => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Open a media folder',
      defaultPath: initialDirectory || undefined,
      properties: ['openDirectory'],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled || !result.filePaths[0]) return [];
    logActivity('INFO', 'source.folder-selection', { path: result.filePaths[0] });

    try {
      const sourceRoot = result.filePaths[0];
      const discovered = await recursivelyFindMedia(sourceRoot, (completed) =>
        emitSourceScanProgress(event.sender, { phase: 'discovering', completed, total: null }));
      const selectedPaths = discovered.videos.length ? discovered.videos : discovered.audio;
      const indexed = await boundedMap(
        selectedPaths,
        FILE_INDEX_LIMIT,
        (filePath) => toSourceFile(filePath, sourceRoot),
        (completed, total, filePath) => emitSourceScanProgress(event.sender, {
          phase: 'indexing', completed, total, currentName: path.basename(filePath),
        }),
      );
      const files = indexed.filter((file): file is SourceFile => file !== null);
      const inspected = keepOneWorkflow(await inspectSources(files, (completed, total, file) =>
        emitSourceScanProgress(event.sender, { phase: 'inspecting', completed, total, currentName: file.name })));
      return discovered.videos.length ? attachExternalSubtitles(inspected, discovered.subtitles) : inspected;
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
  ipcMain.handle('encode:start', (event, jobs: EncodeJob[], simultaneousEncoding = true) => {
    const ffmpegPath = activeFfmpeg();
    const ccextractorPath = runtimeState?.ccextractorAvailable
      ? runtimeState.ccextractorPath
      : '';
    const rsgainPath = runtimeState?.rsgainAvailable ? runtimeState.rsgainPath : '';
    return startEncodeQueue(ffmpegPath, ccextractorPath, rsgainPath, jobs, event.sender, simultaneousEncoding);
  });

  ipcMain.handle('subtitle:import', async (event, sourcePath: string, firstIndex: number): Promise<SubtitleImportResult> => {
    const parent = BrowserWindow.fromWebContents(event.sender);
    const options: Electron.OpenDialogOptions = {
      title: 'Import UTF-8 subtitle files',
      defaultPath: path.dirname(sourcePath),
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'UTF-8 subtitle files', extensions: UTF8_SUBTITLE_EXTENSIONS.map((ext) => ext.slice(1)) }],
    };
    const result = parent
      ? await dialog.showOpenDialog(parent, options)
      : await dialog.showOpenDialog(options);
    if (result.canceled) return { tracks: [], rejectedPaths: [] };
    const validPaths = await readableUtf8SubtitlePaths(result.filePaths);
    const valid = new Set(validPaths.map((subtitlePath) => path.resolve(subtitlePath).toLocaleLowerCase()));
    const rejectedPaths = result.filePaths.filter((subtitlePath) =>
      !valid.has(path.resolve(subtitlePath).toLocaleLowerCase()));
    return { tracks: importedSubtitleTracks(sourcePath, validPaths, firstIndex), rejectedPaths };
  });
  ipcMain.handle('encode:cancel', (_event, jobIndex?: number) => cancelEncoding(jobIndex));

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

  mainWindow.webContents.on('render-process-gone', (_event, details) => {
    logActivity('ERROR', 'renderer.process-gone', {
      reason: details.reason,
      exitCode: details.exitCode,
    });
  });
  mainWindow.on('unresponsive', () => logActivity('ERROR', 'renderer.unresponsive'));

  if (MAIN_WINDOW_VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, `../renderer/${MAIN_WINDOW_VITE_NAME}/index.html`));
  }
};

if (!handlingSquirrelEvent) app.whenReady().then(async () => {
  if (app.isPackaged && process.platform === 'win32') {
    await cleanupPreviousInstall(path.dirname(process.execPath)).catch(() => undefined);
  }
  await initializeLogger();
  logActivity('INFO', 'application.started', {
    version: app.getVersion(),
    packaged: app.isPackaged,
    uiHardwareAcceleration: !shouldDisableUiHardwareAcceleration(process.platform),
  });
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
