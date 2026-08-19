import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings, EncodeJob, EncodeProgress, EncodeStartResult, HardwareCapabilities, RuntimeState, SourceFile,
} from './shared-types';

export type { AppSettings, RuntimeState, SourceFile } from './shared-types';

contextBridge.exposeInMainWorld('mediaAPI', {
  openFile: (initialDirectory?: string): Promise<SourceFile[]> => ipcRenderer.invoke('source:open-file', initialDirectory),
  openFolder: (initialDirectory?: string): Promise<SourceFile[]> => ipcRenderer.invoke('source:open-folder', initialDirectory),
  chooseOutputDirectory: (defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('output:choose-directory', defaultPath),
  prepareOutputDirectory: (directoryPath: string): Promise<boolean> =>
    ipcRenderer.invoke('output:prepare-directory', directoryPath),
  showInFolder: (targetPath: string): Promise<void> => ipcRenderer.invoke('path:show', targetPath),
  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:save', settings),
  releasePreviews: (ids: string[]): Promise<void> => ipcRenderer.invoke('source:release-previews', ids),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  checkForUpdates: (): Promise<string> => ipcRenderer.invoke('app:check-update'),
  detectHardware: (): Promise<HardwareCapabilities> => ipcRenderer.invoke('hardware:detect'),
  readLog: (): Promise<string> => ipcRenderer.invoke('log:read'),
  readConfig: (settings: AppSettings): Promise<string> => ipcRenderer.invoke('config:read', settings),
  initializeRuntime: (): Promise<RuntimeState> => ipcRenderer.invoke('runtime:initialize'),
  startEncode: (jobs: EncodeJob[]): Promise<EncodeStartResult> => ipcRenderer.invoke('encode:start', jobs),
  cancelEncode: (jobIndex?: number): Promise<boolean> => ipcRenderer.invoke('encode:cancel', jobIndex),
  onEncodeProgress: (callback: (progress: EncodeProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: EncodeProgress) => callback(progress);
    ipcRenderer.on('encode:progress', listener);
    return () => ipcRenderer.removeListener('encode:progress', listener);
  },
  onRuntimeProgress: (callback: (state: RuntimeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: RuntimeState) => callback(state);
    ipcRenderer.on('runtime:progress', listener);
    return () => ipcRenderer.removeListener('runtime:progress', listener);
  },
});

declare global {
  interface Window {
    mediaAPI: {
      openFile: (initialDirectory?: string) => Promise<SourceFile[]>;
      openFolder: (initialDirectory?: string) => Promise<SourceFile[]>;
      chooseOutputDirectory: (defaultPath: string) => Promise<string | null>;
      prepareOutputDirectory: (directoryPath: string) => Promise<boolean>;
      showInFolder: (targetPath: string) => Promise<void>;
      loadSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      releasePreviews: (ids: string[]) => Promise<void>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      checkForUpdates: () => Promise<string>;
      detectHardware: () => Promise<HardwareCapabilities>;
      readLog: () => Promise<string>;
      readConfig: (settings: AppSettings) => Promise<string>;
      initializeRuntime: () => Promise<RuntimeState>;
      startEncode: (jobs: EncodeJob[]) => Promise<EncodeStartResult>;
      cancelEncode: (jobIndex?: number) => Promise<boolean>;
      onEncodeProgress: (callback: (progress: EncodeProgress) => void) => () => void;
      onRuntimeProgress: (callback: (state: RuntimeState) => void) => () => void;
    };
  }
}
