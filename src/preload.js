// See the Electron documentation for details on how to use preload scripts:
// https://www.electronjs.org/docs/latest/tutorial/process-model#preload-scripts


const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  onFileSelected: (callback) => ipcRenderer.on('file-selected', (event, path) => callback(path)),
  pickFile: () => ipcRenderer.invoke('dialog:openFile'),
  pickFolder: () => ipcRenderer.invoke('dialog:openFolder'),
  getFfmpegInfo: () => ipcRenderer.invoke('ffmpeg-info'),
  extractFrames: (videoPath) => ipcRenderer.invoke('extract-frames', videoPath),
  getMetadata: (filePath) => ipcRenderer.invoke('getMetadata', filePath)
});

contextBridge.exposeInMainWorld('gpuAPI', {
  getGpuInfo: () => ipcRenderer.invoke('get-gpu-info')
});
