import { contextBridge, ipcRenderer } from 'electron';
import type {
  AppSettings, EncodeJob, EncodeProgress, EncodeStartResult, HardwareCapabilities, RuntimeState, SavedPreset, SourceFile,
  SourceScanProgress, SubtitleImportResult,
} from './shared-types';
import type { BuiltInPresetConfiguration } from './presets';

export type { AppSettings, RuntimeState, SourceFile } from './shared-types';

contextBridge.exposeInMainWorld('mediaAPI', {
  openFile: (initialDirectory?: string): Promise<SourceFile[]> => ipcRenderer.invoke('source:open-file', initialDirectory),
  openFolder: (initialDirectory?: string): Promise<SourceFile[]> => ipcRenderer.invoke('source:open-folder', initialDirectory),
  importSubtitles: (sourcePath: string, firstIndex: number): Promise<SubtitleImportResult> =>
    ipcRenderer.invoke('subtitle:import', sourcePath, firstIndex),
  chooseOutputDirectory: (defaultPath: string): Promise<string | null> =>
    ipcRenderer.invoke('output:choose-directory', defaultPath),
  showInFolder: (targetPath: string): Promise<void> => ipcRenderer.invoke('path:show', targetPath),
  loadSettings: (): Promise<AppSettings> => ipcRenderer.invoke('settings:load'),
  saveSettings: (settings: AppSettings): Promise<void> => ipcRenderer.invoke('settings:save', settings),
  loadBuiltInPresets: (): Promise<BuiltInPresetConfiguration> => ipcRenderer.invoke('presets:load'),
  readPresetFile: (): Promise<string> => ipcRenderer.invoke('presets:read'),
  showPresetFile: (): Promise<void> => ipcRenderer.invoke('presets:show'),
  loadCustomPresets: (): Promise<SavedPreset[]> => ipcRenderer.invoke('custom-presets:load'),
  saveCustomPresets: (presets: SavedPreset[]): Promise<void> => ipcRenderer.invoke('custom-presets:save', presets),
  readCustomPresetFile: (): Promise<string> => ipcRenderer.invoke('custom-presets:read'),
  showCustomPresetFile: (): Promise<boolean> => ipcRenderer.invoke('custom-presets:show'),
  releasePreviews: (ids: string[]): Promise<void> => ipcRenderer.invoke('source:release-previews', ids),
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  finishAndClose: (): Promise<void> => ipcRenderer.invoke('app:finish-and-close'),
  checkForUpdates: (): Promise<string> => ipcRenderer.invoke('app:check-update'),
  readChangelog: (): Promise<string> => ipcRenderer.invoke('app:read-changelog'),
  detectHardware: (): Promise<HardwareCapabilities> => ipcRenderer.invoke('hardware:detect'),
  readLog: (): Promise<string> => ipcRenderer.invoke('log:read'),
  readConfig: (settings: AppSettings): Promise<string> => ipcRenderer.invoke('config:read', settings),
  initializeAppUpdate: (): Promise<void> => ipcRenderer.invoke('app:initialize-update'),
  initializeRuntime: (useStableFfmpeg: boolean): Promise<RuntimeState> =>
    ipcRenderer.invoke('runtime:initialize', useStableFfmpeg),
  selectRuntimeChannel: (useStableFfmpeg: boolean): Promise<RuntimeState> =>
    ipcRenderer.invoke('runtime:select-channel', useStableFfmpeg),
  startEncode: (jobs: EncodeJob[], simultaneousEncoding: boolean): Promise<EncodeStartResult> =>
    ipcRenderer.invoke('encode:start', jobs, simultaneousEncoding),
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
  onSourceScanProgress: (callback: (progress: SourceScanProgress) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, progress: SourceScanProgress) => callback(progress);
    ipcRenderer.on('source:scan-progress', listener);
    return () => ipcRenderer.removeListener('source:scan-progress', listener);
  },
});

declare global {
  interface Window {
    mediaAPI: {
      openFile: (initialDirectory?: string) => Promise<SourceFile[]>;
      openFolder: (initialDirectory?: string) => Promise<SourceFile[]>;
      importSubtitles: (sourcePath: string, firstIndex: number) => Promise<SubtitleImportResult>;
      chooseOutputDirectory: (defaultPath: string) => Promise<string | null>;
      showInFolder: (targetPath: string) => Promise<void>;
      loadSettings: () => Promise<AppSettings>;
      saveSettings: (settings: AppSettings) => Promise<void>;
      loadBuiltInPresets: () => Promise<BuiltInPresetConfiguration>;
      readPresetFile: () => Promise<string>;
      showPresetFile: () => Promise<void>;
      loadCustomPresets: () => Promise<SavedPreset[]>;
      saveCustomPresets: (presets: SavedPreset[]) => Promise<void>;
      readCustomPresetFile: () => Promise<string>;
      showCustomPresetFile: () => Promise<boolean>;
      releasePreviews: (ids: string[]) => Promise<void>;
      minimizeWindow: () => Promise<void>;
      closeWindow: () => Promise<void>;
      finishAndClose: () => Promise<void>;
      checkForUpdates: () => Promise<string>;
      readChangelog: () => Promise<string>;
      detectHardware: () => Promise<HardwareCapabilities>;
      readLog: () => Promise<string>;
      readConfig: (settings: AppSettings) => Promise<string>;
      initializeAppUpdate: () => Promise<void>;
      initializeRuntime: (useStableFfmpeg: boolean) => Promise<RuntimeState>;
      selectRuntimeChannel: (useStableFfmpeg: boolean) => Promise<RuntimeState>;
      startEncode: (jobs: EncodeJob[], simultaneousEncoding: boolean) => Promise<EncodeStartResult>;
      cancelEncode: (jobIndex?: number) => Promise<boolean>;
      onEncodeProgress: (callback: (progress: EncodeProgress) => void) => () => void;
      onRuntimeProgress: (callback: (state: RuntimeState) => void) => () => void;
      onSourceScanProgress: (callback: (progress: SourceScanProgress) => void) => () => void;
    };
  }
}
