/**
 * This file will automatically be loaded by webpack and run in the "renderer" context.
 * To learn more about the differences between the "main" and the "renderer" context in
 * Electron, visit:
 *
 * https://electronjs.org/docs/tutorial/process-model
 *
 * By default, Node.js integration in this file is disabled. When enabling Node.js integration
 * in a renderer process, please be aware of potential security implications. You can read
 * more about security risks here:
 *
 * https://electronjs.org/docs/tutorial/security
 *
 * To enable Node.js integration in this file, open up `main.js` and enable the `nodeIntegration`
 * flag:
 *
 * ```
 *  // Create the browser window.
 *  mainWindow = new BrowserWindow({
 *    width: 800,
 *    height: 600,
 *    webPreferences: {
 *      nodeIntegration: true
 *    }
 *  });
 * ```
 */
import './index.css';

window.addEventListener('DOMContentLoaded', () => {
  const status = document.getElementById('status');
  const pickBtn = document.getElementById('pickBtn');
  const modal = document.getElementById('modal-file-prompt');

  // Show modal when Browse button is clicked
  pickBtn.addEventListener('click', (e) => {
    e.preventDefault();
    modal.style.display = 'flex';
  });

  // Handle Batch (folder) selection
  document.getElementById('batchBtn').addEventListener('click', async () => {
    console.log("[debug][renderer.js] Batch folder clicked");
    const folderPath = await window.electronAPI.pickFolder();
    if (folderPath) {
      console.log("[debug][renderjs] Path picked: "+folderPath);
      status.value = folderPath;
      modal.style.display = 'none';
    }
  });

  // Handle Single file selection
  document.getElementById('singleBtn').addEventListener('click', async () => {
    console.log("[debug][renderer.js] Single file clicked");
    const filePath = await window.electronAPI.pickFile();
    if (filePath) {
      console.log("[debug][renderjs] File path picked: "+filePath);
      status.value = filePath;
      modal.style.display = 'none';
    }
  });
});

console.log('👋 Renderer loaded');
