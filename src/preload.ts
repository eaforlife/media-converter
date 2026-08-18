import { contextBridge, ipcRenderer } from 'electron';
import type { AppSettings, HardwareCapabilities, RuntimeState, SourceFile } from './shared-types';

export type { AppSettings, RuntimeState, SourceFile } from './shared-types';

contextBridge.exposeInMainWorld('mediaAPI', {
  openFile: (initialDirectory?: string): Promise<SourceFile[]> => ipcRenderer.invoke('source:open-file', initialDirectory),
  openFolder: (initialDirectory?: string): Promise<SourceFile[]> => ipcRenderer.invoke('source:open-folder', initialDirectory),
  chooseOutput: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('output:choose', defaultName),
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
      chooseOutput: (defaultName: string) => Promise<string | null>;
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
      onRuntimeProgress: (callback: (state: RuntimeState) => void) => () => void;
    };
  }
}
