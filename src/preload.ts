import { contextBridge, ipcRenderer } from 'electron';
import type { RuntimeState, SourceFile } from './shared-types';

export type { RuntimeState, SourceFile } from './shared-types';

contextBridge.exposeInMainWorld('mediaAPI', {
  openFile: (): Promise<SourceFile[]> => ipcRenderer.invoke('source:open-file'),
  openFolder: (): Promise<SourceFile[]> => ipcRenderer.invoke('source:open-folder'),
  chooseOutput: (defaultName: string): Promise<string | null> =>
    ipcRenderer.invoke('output:choose', defaultName),
  showInFolder: (targetPath: string): Promise<void> => ipcRenderer.invoke('path:show', targetPath),
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
      openFile: () => Promise<SourceFile[]>;
      openFolder: () => Promise<SourceFile[]>;
      chooseOutput: (defaultName: string) => Promise<string | null>;
      showInFolder: (targetPath: string) => Promise<void>;
      initializeRuntime: () => Promise<RuntimeState>;
      onRuntimeProgress: (callback: (state: RuntimeState) => void) => () => void;
    };
  }
}
