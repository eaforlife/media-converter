import { app } from 'electron';
import path from 'node:path';

/** Store mutable app files beside the bundled resources in packaged builds. */
export const appStoragePath = () => app.isPackaged
  ? process.resourcesPath
  : path.join(app.getAppPath(), '.app-data');
