import './index.css';

let ffEncoder = "CPU";
const consolelog = document.getElementById("content-logs");
const bodyTag = document.getElementById("body");
// Encoder variables. Index 0=cpu, 1=nvidia, 2=intel, 3=amd
const vendor = ['cpu','nvidia','intel','amd'];
const h264enc = ['libx264','h264_nvenc','h264_qsv','h264_amf'];
const h265enc = ['libx265','hevc_nvenc','hevc_qsv','hevc_amf'];
const av1enc = ['null','av1_nvenc','av1_qsv','av1_amf'];
let availableEnc = [];
let containerVid = ['mkv'];
// For Preview Box
let currentIndex = 0;
let framePaths = [];



showLoading();

window.addEventListener('DOMContentLoaded', async () => {
  resetImageHolder();
  setLogs("Application Started");

  const status = document.getElementById('status');
  const pickBtn = document.getElementById('pickBtn');
  const modal = document.getElementById('modal-file-prompt');

  // Get FFmpeg info
  const info = await window.electronAPI.getFfmpegInfo();
  updateStatusBar(`Starting FFMPEG version ${info.version}`);
  setLogs(`Running FFMPEG version ${info.version}`);

  hideLoading();
  document.body.classList.add('loaded');

  setEncoder("NVENC", info.capabilities.nvenc);
  setEncoder("QSV", info.capabilities.qsv);
  setEncoder("AMF", info.capabilities.amf);

  if (ffEncoder === "CPU") {
    setLogs("No hardware encoders found. Using CPU");
  } else {
    setLogs(`Found ${ffEncoder} for hardware encoding!`);
  }

  // Show modal initially
  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
  updateStatusBar("Waiting for input...");
  setLogs("Waiting for input...");

  // Browse button reopens modal
  pickBtn.addEventListener('click', (e) => {
    e.preventDefault();
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';
    updateStatusBar("Waiting for input...");
    setLogs("Waiting for input...");
  });

  // Handle Batch (folder) selection
  document.getElementById('batchBtn').addEventListener('click', async () => {
    const folderPath = await window.electronAPI.pickFolder();
    if (folderPath) {
      updateStatusBar(`Batch selected with path ${folderPath}`);
      setLogs("Selected batch encoding.");
      setLogs(`Folder path is ${folderPath}`);
      status.value = folderPath;
      modal.style.display = 'none';
    }
  });

  // Handle Single file selection
  document.getElementById('singleBtn').addEventListener('click', async () => {
    const filePath = await window.electronAPI.pickFile();
    if (filePath) {
      resetImageHolder();
      updateStatusBar(`File selected with path ${filePath}`);
      status.value = filePath;
      modal.style.display = 'none';
      document.body.style.overflow = '';
      setLogs("Selected single file encoding.");
      setLogs(`File path is ${filePath}`);

      // get metadata of file
      const metadata = await window.electronAPI.getMetadata(filePath);
      const { video, audio, subtitle, chapters, format } = splitStreams(metadata);

      await pickVideo(filePath); // handles video + frames
      setLogs("Metadata collected:");
      console.log("[Debug] Array video stream:",video);
      setLogs(`Video Streams:\nCodec: ${video[0]['codec_name']} ${video[0]['profile']}\nColor: ${video[0]['pix_fmt']}\n\tDimensions: ${video[0]['width']} x ${video[0]['height']}`);
      setLogs(`Audio Streams: ${audio}`);
      populateForm();
    }
  });
});

function showLoading() {
  document.getElementById('loading-modal').style.display = 'flex';
}
function hideLoading() {
  document.getElementById('loading-modal').style.display = 'none';
}

function resetImageHolder() {
  // set image preview placeholder
  document.getElementById('scroller-image').src =
  "data:image/svg+xml;base64," +
  btoa('<svg xmlns="http://www.w3.org/2000/svg" width="500" height="380"><rect width="100%" height="100%" fill="#444"/></svg>');

}

function setEncoder(enc, available) {
  if (available) {
    const encName = [''];
    const spanHwAccel = document.getElementById('hw-accel');
    getGPU().then(result => {
      console.log("[Debug][getGPU] getGPU async: ",result);
      if (result !== "cpu") {
        spanHwAccel.textContent = `Hardware encoder detected. Using ${result}`;
        spanHwAccel.style.color = "green";
        setLogs(`Hardware encoder available: ${enc}`);
        ffEncoder = result;
      } else {
        spanHwAccel.textContent = `No hardware encoder detected. Using software.`;
        spanHwAccel.style.color = "red";
        setLogs(`No hardware encoder detected. Using software.`);
        ffEncoder = enc;
      } 
    }).catch(encErr => {
      spanHwAccel.textContent = `Error looking for encoder. Using software.`;
      spanHwAccel.style.color = "red";
      ffEncoder = "CPU";
      consolelog("[Debug][setEncoder] Error in getGPU().");
      console.log("[Debug][setEncoder] Error in getGPU():\m",encErr);
    });    
  }
}

function setLogs(msg) {
  const now = new Date();
  const timestamp = now.toLocaleTimeString();
  const entry = document.createElement('div');
  entry.textContent = `[${timestamp}] ${msg}`;
  consolelog.appendChild(entry);
  consolelog.scrollTop = consolelog.scrollHeight;
}

function updateStatusBar(msg) {
  const statusText = document.getElementById('status-text');
  if (msg) statusText.textContent = msg;
}

async function getGPU() {
  const gpuinfo = await window.gpuAPI.getGpuInfo();
  const gpuname = gpuinfo.gpuDevice[0]?.deviceString;
  console.log(`[Debug] GPU Name: ${gpuname}`);
  console.log("[Debug] GPU Info:");
  console.log(gpuinfo);
  const encIndex = vendor.findIndex(e => gpuname.toLowerCase().includes(e));
  console.log(`[Debug][getGPU] GPU index: ${encIndex}`);
  return encIndex !== -1 ? vendor[encIndex] : "cpu";
}

async function pickVideo(filePath) {
  showLoading();
  setLogs(`Scanning media ${filePath}`);

  if (!filePath) {
    hideLoading();
    return;
  }

  // Make sure variables are empty
  framePaths = [];
  currentIndex = 0;
  resetImageHolder();

  framePaths = await window.electronAPI.extractFrames(filePath);
  currentIndex = 0;
  setLogs("Done fetching media.");
  hideLoading();
  updateScroller();
}

function updateScroller() {
  const imgEl = document.getElementById('scroller-image');
  const countEl = document.getElementById('image-count');

  if (framePaths.length > 0) {
    imgEl.src = `file://${framePaths[currentIndex]}`;
    countEl.textContent = `${currentIndex + 1} / ${framePaths.length}`;
  } else {
    // fallback to placeholder
    resetImageHolder();
    countEl.textContent = "0 / 0";
  }
}

document.getElementById('prev-btn').addEventListener('click', () => {
  if (framePaths.length === 0) return;
  currentIndex = (currentIndex - 1 + framePaths.length) % framePaths.length;
  updateScroller();
});

document.getElementById('next-btn').addEventListener('click', () => {
  if (framePaths.length === 0) return;
  currentIndex = (currentIndex + 1) % framePaths.length;
  updateScroller();
});
// End of Preview Box

// Stream data
function splitStreams(metadata) {
  const videoStreams = metadata.streams.filter(s => s.codec_type === 'video');
  const audioStreams = metadata.streams.filter(s => s.codec_type === 'audio');
  const subtitleStreams = metadata.streams.filter(s => s.codec_type === 'subtitle');

  return {
    video: videoStreams,
    audio: audioStreams,
    subtitle: subtitleStreams,
    chapters: metadata.chapters || [],
    format: metadata.format || {}
  };
}


function populateForm() {
  const frmContainer = document.getElementById('vid-container');
  const frmCodec = document.getElementById('vid-codec');

  // set variable
  // todo: add logic from stream mapping
  containerVid = ['mkv','mp4','m4v'];
  removeSelect(frmContainer);
  removeSelect(frmCodec);
  const codecIx = vendor.findIndex(e => ffEncoder.toLowerCase().includes(e));
  console.log("[Debug][Popform] vendor is ",vendor);
  console.log("[Debug][Popform] setEncoder is ",ffEncoder);
  const frmSelCodec = [];
  console.log("[Debug][Popform] Index of codec",codecIx);
  
  frmSelCodec.push(h264enc[codecIx]);
  frmSelCodec.push(h265enc[codecIx]);
  av1enc[codecIx] !== "null" && frmSelCodec.push(av1enc[codecIx]); 
  console.log("[Debug][Popform] frmSelCodec values",frmSelCodec);

  // set form
  fillSelect(frmContainer,containerVid);
  fillSelect(frmCodec,frmSelCodec);

  // autofill form
  frmContainer.selectedIndex = 0;
}

function fillSelect(frm,ob) {
  ob.forEach(i => {
    const x = document.createElement("option");
    x.value = ob;
    x.textContent = i.toUpperCase();
    frm.appendChild(x);
  })
}

function removeSelect(el) {
  var i, L = el.options.length - 1;
  for(i = L; i >= 0; i--) {
      el.remove(i);
   }
}

console.log('👋 Renderer loaded');
