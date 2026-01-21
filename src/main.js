const { app, BrowserWindow, dialog, ipcMain, protocol } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const ffmpegStatic = require('ffmpeg-static');
const ffprobeStatic = require('ffprobe-static');
const tmpDir = path.join(os.tmpdir(), 'video-frames');

// to properly ship ffmpeg and ffprobe to binaries
let ffmpegPath = ffmpegStatic;
let ffprobePath = ffprobeStatic.path;
if (ffmpegPath.includes('app.asar')) { 
  ffmpegPath = ffmpegPath.replace('app.asar', 'app.asar.unpacked'); 
}
if (ffprobePath.includes('app.asar')) { 
  ffprobePath = ffprobePath.replace('app.asar', 'app.asar.unpacked'); 
}

console.log("[debug][mainjs] ffmpeg: ",ffmpegPath);

// Helper to run ffmpeg command and capture output
function runFfmpegCommand(args) {
  return new Promise((resolve) => {
    let output = '';
    const proc = spawn(ffmpegPath, args);

    proc.stdout.on('data', (data) => output += data.toString());
    proc.stderr.on('data', (data) => output += data.toString());

    proc.on('close', () => resolve(output));
  });
}

// Probe if a hardware encoder works
async function testCodec(codec) {
  return new Promise((resolve) => {
    //console.log(`[DEBUG] Testing codec: ${codec}`);
    const args = [
      '-hide_banner',
      '-f', 'lavfi',
      '-i', 'testsrc=duration=1:size=1280x720:rate=90',
      '-c:v', codec,
      '-f', 'null', '-'
    ];
    const proc = spawn(ffmpegPath, args);
    let stderr = '';
    proc.stderr.on('data', (data) => {
      const msg = data.toString();
      stderr += msg;
      //console.log(`[DEBUG:${codec}] ${msg}`); // live log of ffmpeg output
    });
    proc.on('close', () => {
      let usable = false;

      // Global override: if preset error appears, assume true
      if (/Cannot get the preset configuration: unsupported param/i.test(stderr)) {
        usable = true;
      }

      //console.log(`[DEBUG] Codec ${codec} usable: ${usable}`);
      resolve(usable);
    });
    
    proc.on('error', (err) => {
      //console.error(`[DEBUG] Codec ${codec} spawn error:`, err);
      resolve(false);
    });
  });
}

// Handle creating/removing shortcuts on Windows when installing/uninstalling.
if (require('electron-squirrel-startup')) {
  app.quit();
}

// Must be called before app is ready
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'file',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
      bypassCSP: true
    }
  }
]);


const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 750,
    height: 550,
    resizable: false,
    fullscreenable: false,
    maximizable: false,
    webPreferences: {
      preload: MAIN_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: true,
      webSecurity: false, // to be changed later.
    },
  });

  // and load the index.html of the app.
  mainWindow.loadURL(MAIN_WINDOW_WEBPACK_ENTRY);
  // Open the DevTools.
  //mainWindow.webContents.openDevTools();
  // IPC handler: renderer requests ffmpeg info
  ipcMain.handle('ffmpeg-info', async () => {
    const versionOutput = await runFfmpegCommand(['-version']);
    const versionTag = versionOutput.split('\n')[0].split(' ')[2];

    const nvenc = await testCodec('h264_nvenc');
    const qsv   = await testCodec('h264_qsv');
    const amf   = await testCodec('h264_amf');

    return {
      version: versionTag,
      capabilities: {
        nvenc,
        qsv,
        amf
      }
    };
  });
};

// Open file dialog
ipcMain.handle('dialog:openFile', async () => {
    //console.log("[debug] openFile handler triggered");
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ['openFile','dontAddToRecent'],
      filters: [{
        name: 'Video Files',
        extensions: ['mp4','mkv','m4v']
      }]
    });
    return canceled ? null : filePaths[0];
});

// Open folder dialog
ipcMain.handle('dialog:openFolder', async () => {
  console.log("[debug] openFolder handler triggered");
  const { canceled, filePaths } = await dialog.showOpenDialog({
    properties: ['openDirectory']
  });
  return canceled ? null : filePaths[0];
});

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(async() => {
  createWindow();
  // Get GPU details
  const completeInfo = await app.getGPUInfo('basic');
  ipcMain.handle('get-gpu-info', () => completeInfo);
  // On OS X it's common to re-create a window in the app when the
  // dock icon is clicked and there are no other windows open.
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      protocol.handle('app', async (request) => {
        const url = request.url.replace('app://uploads/', '');
        const filePath = path.join(app.getPath('userData'), 'uploads', url);
        return new Response(fs.readFileSync(filePath));
      });
      createWindow();
    }
  });
});

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    try {
      if (fs.existsSync(tmpDir)) {
        fs.rmSync(tmpDir, { recursive: true, force: true });
        console.log(`[MAIN] Cleaned up temp directory: ${tmpDir}`);
      }
    } catch (err) {
      console.error(`[MAIN] Error cleaning temp directory:`, err);
    }
    app.quit();
  }
});

// Cleanup tmpDir on quit
app.on('quit', () => {
  try {
    if (fs.existsSync(tmpDir)) {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log(`[MAIN] Cleaned up temp directory: ${tmpDir}`);
    }
  } catch (err) {
    console.error(`[MAIN] Error cleaning temp directory:`, err);
  }
});

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and import them here.
ipcMain.handle('extract-frames', async (e, videoPath) => {

// Always reset the temp directory
  if (fs.existsSync(tmpDir)) {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
      console.log(`[MAIN] Removed old temp directory: ${tmpDir}`);
    } catch (err) {
      console.error(`[MAIN] Error removing temp directory:`, err);
    }
  }

  try {
    fs.mkdirSync(tmpDir, { recursive: true });
    console.log(`[MAIN] Created fresh temp directory: ${tmpDir}`);
    } catch (err) {
    console.error(`[MAIN] Error creating temp directory:`, err);
  }


  // Step 1: probe duration
  const duration = await new Promise((resolve, reject) => {
    debugLog('Running ffprobe...');
    const ffprobe = spawn(ffprobePath, [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      '-analyzeduration', '100M',
      '-probesize', '100M',
      videoPath
    ]);
    let output = '';
    ffprobe.stdout.on('data', d => {
      output += d.toString();
      debugLog('ffprobe stdout:', d.toString().trim());
    });
    ffprobe.on('close', (code) => {
      debugLog('ffprobe exited with code', code);
      resolve(parseFloat(output));
    });
    ffprobe.on('error', reject);
  });

  debugLog('Video duration:', duration);

  // Step 2: calculate timestamps
  const percents = [0.05, 0.10, 0.20, 0.31, 0.42, 0.56, 0.68, 0.79, 0.93];
  const timestamps = percents.map(p => duration * p);
  debugLog('Timestamps:', timestamps);

  // Step 3: extract frames
  const framePaths = [];
  for (let i = 0; i < timestamps.length; i++) {
    const outPath = path.join(tmpDir, `frame-${i}.png`);
    framePaths.push(outPath);

    debugLog(`Extracting frame ${i} at ${timestamps[i]}s -> ${outPath}`);

    await new Promise((resolve, reject) => {
      const ffmpeg = spawn(ffmpegPath, [
        '-ss', timestamps[i].toString(),
        '-i', videoPath,
        '-vf', 'scale=960:-1',
        '-frames:v', '1',
        '-q:v', '2',
        outPath
      ]);
      ffmpeg.on('close', (code) => {
        debugLog('ffmpeg exited with code', code);
        code === 0 ? resolve() : reject(new Error('ffmpeg failed'));
      });
    });
  }

  return framePaths;
});

// Step 4: Get Metadata when called
ipcMain.handle('getMetadata', async (event, filePath) => {
  return new Promise((resolve, reject) => {
    const ffprobe = spawn(ffprobePath, [
      '-v', 'error',
      '-show_format',
      '-show_streams',
      '-show_chapters',
      '-print_format', 'json',
      filePath
    ]);

    let data = '';
    ffprobe.stdout.on('data', chunk => data += chunk);
    ffprobe.stderr.on('data', err => console.error(err.toString()));

    ffprobe.on('close', code => {
      if (code === 0) {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(e);
        }
      } else {
        reject(new Error(`ffprobe exited with code ${code}`));
      }
    });
  });
});


function debugLog(...args) { 
  const ts = new Date().toISOString();
  console.log(`[MAIN ${ts}]`, ...args); 
}

