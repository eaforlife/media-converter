import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import started from 'electron-squirrel-startup';
import { updateElectronApp, UpdateSourceType } from 'update-electron-app';
import { APP_NAME, APP_UPDATE_REPOSITORY } from './config';
import { initializeRuntime } from './runtime-manager';
import type { SourceFile } from './shared-types';

if (started) app.quit();

const MEDIA_EXTENSIONS = new Set([
  '.mp4', '.mkv', '.mov', '.avi', '.webm', '.m4v', '.mpg', '.mpeg', '.wmv',
  '.flv', '.ts', '.mts', '.m2ts', '.mp3', '.wav', '.flac', '.aac', '.m4a', '.ogg',
]);

const toSourceFile = (filePath: string): SourceFile | null => {
  try {
    const stat = fs.statSync(filePath);
    if (!stat.isFile()) return null;
    return {
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      extension: path.extname(filePath).slice(1).toUpperCase() || 'MEDIA',
    };
  } catch {
    return null;
  }
};

const registerIpc = () => {
  ipcMain.handle('runtime:initialize', (event) => initializeRuntime(event.sender));

  ipcMain.handle('source:open-file', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open a media file',
      properties: ['openFile'],
      filters: [
        { name: 'Media files', extensions: Array.from(MEDIA_EXTENSIONS, (ext) => ext.slice(1)) },
        { name: 'All files', extensions: ['*'] },
      ],
    });
    if (result.canceled || !result.filePaths[0]) return [];
    const file = toSourceFile(result.filePaths[0]);
    return file ? [file] : [];
  });

  ipcMain.handle('source:open-folder', async () => {
    const result = await dialog.showOpenDialog({
      title: 'Open a media folder',
      properties: ['openDirectory'],
    });
    if (result.canceled || !result.filePaths[0]) return [];

    try {
      return fs.readdirSync(result.filePaths[0], { withFileTypes: true })
        .filter((entry) => entry.isFile() && MEDIA_EXTENSIONS.has(path.extname(entry.name).toLowerCase()))
        .map((entry) => toSourceFile(path.join(result.filePaths[0], entry.name)))
        .filter((file): file is SourceFile => file !== null);
    } catch {
      return [];
    }
  });

  ipcMain.handle('output:choose', async (_event, defaultName: string) => {
    const result = await dialog.showSaveDialog({
      title: 'Choose output location',
      defaultPath: defaultName,
      filters: [{ name: 'Video', extensions: ['mp4', 'mkv', 'webm'] }],
    });
    return result.canceled ? null : result.filePath;
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

app.whenReady().then(() => {
  registerIpc();
  createWindow();

  if (app.isPackaged) {
    updateElectronApp({
      updateSource: {
        type: UpdateSourceType.ElectronPublicUpdateService,
        repo: APP_UPDATE_REPOSITORY,
      },
      updateInterval: '1 hour',
      notifyUser: true,
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
