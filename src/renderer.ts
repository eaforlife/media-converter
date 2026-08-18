import './index.css';
import type { RuntimeState, SourceFile } from './shared-types';

type IconName = 'app' | 'file' | 'folder' | 'plus' | 'queue' | 'play' | 'chevron' |
  'film' | 'video' | 'audio' | 'captions' | 'sliders' | 'copy' | 'check' | 'search' |
  'settings' | 'more' | 'sparkles' | 'gauge' | 'monitor' | 'x';

const iconPaths: Record<IconName, string> = {
  app: '<path d="M4 7.5h16v9H4z"/><path d="m8 4 2 3.5M14 4l2 3.5M8 16.5 10 20M14 16.5 16 20"/><path d="M2.5 11.8h19"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="m10 11 5 3-5 3z"/>',
  folder: '<path d="M3 6.5a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  queue: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".7"/><circle cx="3.5" cy="12" r=".7"/><circle cx="3.5" cy="18" r=".7"/>',
  play: '<path d="m8 5 11 7-11 7z"/>',
  chevron: '<path d="m9 18 6-6-6-6"/>',
  film: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M7 4v16M17 4v16M3 9h4M17 9h4M3 15h4M17 15h4"/>',
  video: '<path d="m22 8-6 4 6 4z"/><rect x="2" y="6" width="14" height="12" rx="2"/>',
  audio: '<path d="M9 18V5l10-2v13"/><circle cx="6" cy="18" r="3"/><circle cx="16" cy="16" r="3"/>',
  captions: '<rect x="2" y="5" width="20" height="14" rx="2"/><path d="M8 10.5a2.5 2.5 0 1 0 0 3M17 10.5a2.5 2.5 0 1 0 0 3"/>',
  sliders: '<path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3"/><path d="M1 14h6M9 8h6M17 16h6"/>',
  copy: '<rect x="9" y="9" width="11" height="11" rx="2"/><path d="M15 9V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h3"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1V21h-4v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1-.4H3v-4h.09A1.7 1.7 0 0 0 4.64 8.5a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1V3h4v.09a1.7 1.7 0 0 0 1.1 1.55 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9c.16.38.37.72.6 1 .28.3.64.4 1 .4h.09v4H21a1.7 1.7 0 0 0-1.6.6z"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
  sparkles: '<path d="m12 3-1 3.5L7.5 8l3.5 1.5 1 3.5 1-3.5L16.5 8 13 6.5zM5 14l-.7 2.3L2 17l2.3.7L5 20l.7-2.3L8 17l-2.3-.7zM19 13l-.7 2.3-2.3.7 2.3.7L19 19l.7-2.3L22 16l-2.3-.7z"/>',
  gauge: '<path d="M4.9 19a9 9 0 1 1 14.2 0"/><path d="m12 13 4-4"/><path d="M12 4v2M4 12H2M22 12h-2"/>',
  monitor: '<rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/>',
  x: '<path d="m6 6 12 12M18 6 6 18"/>',
};

const icon = (name: IconName, size = 18) =>
  `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[name]}</svg>`;

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('App root was not found');

let sources: SourceFile[] = [];
let selectedIndex = 0;
let activeTab = 'Summary';
let outputPath = '';
let queueCount = 0;
let toastTimer: number | undefined;
let runtimeState: RuntimeState | null = null;

const escapeHtml = (value: string) => value
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#039;');

const formatSize = (bytes: number) => {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / Math.pow(1024, index)).toFixed(index > 1 ? 1 : 0)} ${units[index]}`;
};

const baseName = (name: string) => name.replace(/\.[^.]+$/, '');
const parentPath = (filePath: string) => filePath.replace(/[\\/][^\\/]+$/, '');
const joinPath = (folder: string, name: string) => `${folder}${folder.includes('\\') ? '\\' : '/'}${name}`;

const showToast = (message: string) => {
  let toast = document.querySelector<HTMLDivElement>('.toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'toast';
    document.body.appendChild(toast);
  }
  toast.innerHTML = `${icon('check', 16)} ${escapeHtml(message)}`;
  toast.classList.add('visible');
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => toast?.classList.remove('visible'), 2200);
};

const renderBootstrap = (state?: RuntimeState) => {
  const progress = state?.progress;
  const phaseLabel = state?.phase === 'error' ? 'RUNTIME CHECK FAILED' : 'PREPARING YOUR WORKSPACE';
  app.innerHTML = `
    <main class="bootstrap-shell">
      <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
      <section class="bootstrap-card">
        <div class="brand bootstrap-brand"><span class="brand-mark">${icon('app', 24)}</span><span>EA Media Tools</span></div>
        <div class="runtime-orbit ${state?.phase === 'error' ? 'error' : ''}">
          <div class="runtime-orbit-inner">${state?.phase === 'error' ? icon('x', 25) : icon('film', 25)}</div>
        </div>
        <div class="eyebrow">${phaseLabel}</div>
        <h1>${state?.phase === 'error' ? 'FFmpeg needs attention' : 'Getting things ready'}</h1>
        <p id="runtime-message">${escapeHtml(state?.message ?? 'Checking the local FFmpeg runtime')}</p>
        <div class="runtime-progress ${progress === null || progress === undefined ? 'indeterminate' : ''}">
          <span style="width: ${progress ?? 36}%"></span>
        </div>
        <small>${state?.isPackaged === false ? 'Development mode · remote downloads are disabled' : `EA Media Tools ${escapeHtml(state?.appVersion ?? '')}`}</small>
      </section>
    </main>`;
};

const renderWelcome = () => {
  app.innerHTML = `
    <main class="welcome-shell">
      <div class="ambient ambient-one"></div><div class="ambient ambient-two"></div>
      <header class="welcome-nav">
        <div class="brand"><span class="brand-mark">${icon('app', 22)}</span><span>EA Media Tools</span></div>
        <button class="icon-button" aria-label="Settings">${icon('settings', 19)}</button>
      </header>
      <section class="welcome-content">
        <div class="eyebrow">${icon('sparkles', 15)} FFMPEG, MADE SIMPLE</div>
        <h1>What would you like<br>to <span>convert?</span></h1>
        <p class="welcome-copy">Start with a video, audio file, or an entire folder.<br>We'll help you handle the rest.</p>
        <div class="source-actions">
          <button class="source-card primary" id="open-file">
            <span class="source-icon">${icon('file', 30)}</span>
            <span class="source-text"><strong>Open a file</strong><small>Select a video or audio file</small></span>
            <span class="source-arrow">${icon('chevron', 19)}</span>
          </button>
          <button class="source-card" id="open-folder">
            <span class="source-icon">${icon('folder', 30)}</span>
            <span class="source-text"><strong>Open a folder</strong><small>Batch process multiple files</small></span>
            <span class="source-arrow">${icon('chevron', 19)}</span>
          </button>
        </div>
        <div class="format-strip"><span>WORKS WITH</span><b>MP4</b><b>MKV</b><b>MOV</b><b>WEBM</b><b>MP3</b><b>+ MORE</b></div>
      </section>
      <footer class="welcome-footer"><span>EA Media Tools ${escapeHtml(runtimeState?.appVersion ?? '')}</span><span class="status-dot ${runtimeState?.ffmpegAvailable ? '' : 'warning'}"></span><span>${runtimeState?.ffmpegAvailable ? `FFmpeg ${escapeHtml(runtimeState.ffmpegVersion ?? 'ready')}` : runtimeState?.isPackaged ? 'FFmpeg unavailable' : 'FFmpeg download skipped'}</span></footer>
    </main>`;

  document.querySelector('#open-file')?.addEventListener('click', () => pickSource('file'));
  document.querySelector('#open-folder')?.addEventListener('click', () => pickSource('folder'));
};

const pickSource = async (type: 'file' | 'folder') => {
  const newSources = type === 'file' ? await window.mediaAPI.openFile() : await window.mediaAPI.openFolder();
  if (!newSources.length) return;
  sources = newSources;
  selectedIndex = 0;
  outputPath = makeDefaultOutput(sources[0]);
  renderWorkspace();
};

const makeDefaultOutput = (source: SourceFile) =>
  joinPath(parentPath(source.path), `${baseName(source.name)}_converted.mp4`);

const currentSettings = () => ({
  format: (document.querySelector('#format') as HTMLSelectElement | null)?.value || 'mp4',
  encoder: (document.querySelector('#encoder') as HTMLSelectElement | null)?.value || 'libx264',
  resolution: (document.querySelector('#resolution') as HTMLSelectElement | null)?.value || '1920:1080',
  quality: (document.querySelector('#quality') as HTMLInputElement | null)?.value || '20',
  audioCodec: (document.querySelector('#audio-codec') as HTMLSelectElement | null)?.value || 'aac',
  audioBitrate: (document.querySelector('#audio-bitrate') as HTMLSelectElement | null)?.value || '160k',
});

const getCommand = () => {
  const source = sources[selectedIndex];
  if (!source) return '';
  const settings = currentSettings();
  return `ffmpeg -i "${source.path}" -c:v ${settings.encoder} -crf ${settings.quality} -vf scale=${settings.resolution} -c:a ${settings.audioCodec} -b:a ${settings.audioBitrate} -movflags +faststart "${outputPath}"`;
};

const renderWorkspace = () => {
  const source = sources[selectedIndex];
  if (!source) return renderWelcome();
  const tabs = [
    ['Summary', 'film'], ['Video', 'video'], ['Audio', 'audio'],
    ['Subtitles', 'captions'], ['Filters', 'sliders'],
  ] as Array<[string, IconName]>;
  const fileRows = sources.map((file, index) => `
    <button class="source-row ${index === selectedIndex ? 'active' : ''}" data-source-index="${index}">
      <span class="file-type">${escapeHtml(file.extension.slice(0, 4))}</span>
      <span class="source-row-copy"><strong>${escapeHtml(file.name)}</strong><small>${formatSize(file.size)}</small></span>
      ${index === selectedIndex ? '<span class="active-pip"></span>' : ''}
    </button>`).join('');

  app.innerHTML = `
    <main class="workspace">
      <header class="topbar">
        <button class="brand brand-button" id="home-button"><span class="brand-mark">${icon('app', 21)}</span><span>EA Media Tools</span></button>
        <div class="topbar-divider"></div>
        <button class="top-action" id="add-source">${icon('plus', 17)} Open source</button>
        <div class="topbar-spacer"></div>
        <button class="top-action queue-button">${icon('queue', 17)} Queue <span class="queue-count">${queueCount}</span></button>
        <button class="icon-button">${icon('settings', 18)}</button>
        <button class="icon-button">${icon('more', 19)}</button>
      </header>

      <aside class="sidebar">
        <div class="sidebar-heading"><span>SOURCES</span><span>${sources.length}</span></div>
        <div class="source-list">${fileRows}</div>
        <button class="add-more" id="add-folder">${icon('plus', 16)} Add more files</button>
        <div class="sidebar-tip"><span>${icon('sparkles', 17)}</span><div><strong>Quick tip</strong><p>You can process a whole folder at once.</p></div></div>
      </aside>

      <section class="work-area">
        <div class="source-hero">
          <div class="media-preview">
            <div class="preview-grid"></div><div class="preview-play">${icon('play', 23)}</div>
            <span>${escapeHtml(source.extension)}</span>
          </div>
          <div class="source-info">
            <div class="section-label">CURRENT SOURCE</div>
            <h2>${escapeHtml(source.name)}</h2>
            <p title="${escapeHtml(source.path)}">${escapeHtml(source.path)}</p>
            <div class="metadata">
              <span><b>Format</b>${escapeHtml(source.extension)}</span>
              <span><b>File size</b>${formatSize(source.size)}</span>
              <span><b>Video</b>Auto detect</span>
              <span><b>Audio</b>Auto detect</span>
            </div>
          </div>
          <button class="icon-button hero-more">${icon('more', 20)}</button>
        </div>

        <div class="preset-bar">
          <div class="preset-icon">${icon('gauge', 22)}</div>
          <div><span>PRESET</span><strong>Fast 1080p30</strong></div>
          <span class="preset-description">Balanced quality and speed</span>
          <button class="preset-select">Change preset ${icon('chevron', 15)}</button>
        </div>

        <nav class="tabs">${tabs.map(([label, tabIcon]) => `<button class="tab ${activeTab === label ? 'active' : ''}" data-tab="${label}">${icon(tabIcon, 17)}${label}</button>`).join('')}</nav>
        <div class="tab-content" id="tab-content">${renderTabContent(activeTab)}</div>
      </section>

      <footer class="encode-footer">
        <div class="destination">
          <span>DESTINATION</span>
          <div class="destination-row">
            <div class="destination-path" title="${escapeHtml(outputPath)}">${icon('folder', 16)}<span>${escapeHtml(outputPath)}</span></div>
            <button id="browse-output">Browse</button>
          </div>
        </div>
        <button class="secondary-button" id="add-queue">${icon('plus', 17)} Add to queue</button>
        <button class="encode-button" id="start-encode">${icon('play', 17)} Start encode</button>
      </footer>
    </main>`;
  bindWorkspaceEvents();
};

const renderTabContent = (tab: string) => {
  if (tab === 'Summary') return `
    <div class="settings-layout">
      <section class="settings-card">
        <div class="card-title"><div><span>OUTPUT SETTINGS</span><h3>Container & dimensions</h3></div><span class="quality-badge">RECOMMENDED</span></div>
        <div class="form-grid">
          <label>Format<select id="format"><option value="mp4">MP4</option><option value="mkv">MKV</option><option value="webm">WebM</option></select></label>
          <label>Resolution<select id="resolution"><option value="1920:1080">1920 × 1080</option><option value="1280:720">1280 × 720</option><option value="3840:2160">3840 × 2160</option><option value="-2:480">Auto × 480</option></select></label>
          <label>Video encoder<select id="encoder"><option value="libx264">H.264 (x264)</option><option value="libx265">H.265 (x265)</option><option value="libsvtav1">AV1 (SVT)</option><option value="h264_nvenc">H.264 (NVIDIA)</option></select></label>
          <label>Frame rate<select><option>Same as source</option><option>30 FPS</option><option>60 FPS</option><option>24 FPS</option></select></label>
        </div>
        <div class="quality-control">
          <div><label for="quality">Constant quality</label><span>Lower values produce higher quality</span></div>
          <output id="quality-value">RF 20</output>
          <input id="quality" type="range" min="14" max="32" value="20" />
          <div class="range-labels"><span>Higher quality</span><span>Smaller file</span></div>
        </div>
      </section>
      <section class="settings-card compact-card">
        <div class="card-title"><div><span>AUDIO</span><h3>Track settings</h3></div>${icon('audio', 19)}</div>
        <div class="form-stack">
          <label>Codec<select id="audio-codec"><option value="aac">AAC</option><option value="libopus">Opus</option><option value="copy">Passthrough</option></select></label>
          <label>Bitrate<select id="audio-bitrate"><option value="160k">160 kbps</option><option value="192k">192 kbps</option><option value="256k">256 kbps</option><option value="320k">320 kbps</option></select></label>
        </div>
        <div class="estimate"><span>ESTIMATED OUTPUT</span><strong>${estimateOutput()}</strong><small>Estimate varies by source duration</small></div>
      </section>
      <section class="command-card">
        <div class="command-heading"><div><span>COMMAND PREVIEW</span><strong>Ready to run</strong></div><button id="copy-command">${icon('copy', 15)} Copy command</button></div>
        <code id="command-preview">${escapeHtml(getCommand())}</code>
      </section>
    </div>`;

  const content: Record<string, [string, string, string]> = {
    Video: ['Video settings', 'Fine-tune encoding', 'Choose codecs, frame rate, quality, color space, and hardware acceleration for your output.'],
    Audio: ['Audio tracks', 'Mix it your way', 'Select audio tracks, codecs, bitrates, channel layouts, and passthrough behavior.'],
    Subtitles: ['Subtitle tracks', 'Keep every word', 'Add, remove, burn in, or pass through subtitle tracks from the source.'],
    Filters: ['Video filters', 'Clean up the picture', 'Configure deinterlacing, denoise, sharpening, cropping, and color adjustments.'],
  };
  const [eyebrow, title, description] = content[tab] || content.Video;
  return `<section class="empty-panel"><div class="empty-panel-icon">${icon(tab === 'Audio' ? 'audio' : tab === 'Subtitles' ? 'captions' : tab === 'Filters' ? 'sliders' : 'video', 28)}</div><span>${eyebrow.toUpperCase()}</span><h3>${title}</h3><p>${description}</p><button>Configure ${tab.toLowerCase()}</button></section>`;
};

const estimateOutput = () => {
  const source = sources[selectedIndex];
  return source ? `~${formatSize(Math.max(source.size * 0.68, 1024 * 1024))}` : '—';
};

const updateCommand = () => {
  const preview = document.querySelector<HTMLElement>('#command-preview');
  if (preview) preview.textContent = getCommand();
  const quality = document.querySelector<HTMLInputElement>('#quality');
  const value = document.querySelector<HTMLOutputElement>('#quality-value');
  if (quality && value) value.textContent = `RF ${quality.value}`;
};

const bindTabEvents = () => {
  document.querySelector('#quality')?.addEventListener('input', updateCommand);
  ['format', 'resolution', 'encoder', 'audio-codec', 'audio-bitrate'].forEach((id) =>
    document.querySelector(`#${id}`)?.addEventListener('change', updateCommand));
  document.querySelector('#copy-command')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(getCommand());
    showToast('FFmpeg command copied');
  });
};

const bindWorkspaceEvents = () => {
  document.querySelector('#home-button')?.addEventListener('click', renderWelcome);
  document.querySelector('#add-source')?.addEventListener('click', () => addSources('file'));
  document.querySelector('#add-folder')?.addEventListener('click', () => addSources('folder'));
  document.querySelectorAll<HTMLElement>('[data-source-index]').forEach((row) => row.addEventListener('click', () => {
    selectedIndex = Number(row.dataset.sourceIndex);
    outputPath = makeDefaultOutput(sources[selectedIndex]);
    renderWorkspace();
  }));
  document.querySelectorAll<HTMLElement>('[data-tab]').forEach((tab) => tab.addEventListener('click', () => {
    activeTab = tab.dataset.tab || 'Summary';
    document.querySelectorAll('.tab').forEach((item) => item.classList.toggle('active', item === tab));
    const content = document.querySelector('#tab-content');
    if (content) content.innerHTML = renderTabContent(activeTab);
    bindTabEvents();
  }));
  document.querySelector('#browse-output')?.addEventListener('click', async () => {
    const selected = await window.mediaAPI.chooseOutput(outputPath);
    if (!selected) return;
    outputPath = selected;
    const pathNode = document.querySelector('.destination-path span');
    if (pathNode) pathNode.textContent = outputPath;
    updateCommand();
  });
  document.querySelector('#add-queue')?.addEventListener('click', () => {
    queueCount += 1;
    const count = document.querySelector('.queue-count');
    if (count) count.textContent = String(queueCount);
    showToast('Job added to queue');
  });
  document.querySelector('#start-encode')?.addEventListener('click', () => showToast('Encode command is ready'));
  bindTabEvents();
};

const addSources = async (type: 'file' | 'folder') => {
  const newSources = type === 'file' ? await window.mediaAPI.openFile() : await window.mediaAPI.openFolder();
  if (!newSources.length) return;
  const known = new Set(sources.map((source) => source.path));
  sources = [...sources, ...newSources.filter((source) => !known.has(source.path))];
  renderWorkspace();
};

const startApplication = async () => {
  renderBootstrap();
  const removeProgressListener = window.mediaAPI.onRuntimeProgress((state) => {
    runtimeState = state;
    renderBootstrap(state);
  });

  try {
    runtimeState = await window.mediaAPI.initializeRuntime();
    renderBootstrap(runtimeState);
    await new Promise((resolve) => window.setTimeout(resolve, runtimeState?.phase === 'error' ? 900 : 350));
  } catch (error) {
    runtimeState = {
      phase: 'error',
      message: error instanceof Error ? error.message : 'Unable to initialize the FFmpeg runtime',
      progress: null,
      appVersion: '1.0.0',
      isPackaged: false,
      updateEnabled: false,
      ffmpegAvailable: false,
      ffmpegPath: '',
      ffprobePath: '',
      ffmpegVersion: null,
      releaseTag: null,
    };
    renderBootstrap(runtimeState);
    await new Promise((resolve) => window.setTimeout(resolve, 900));
  } finally {
    removeProgressListener();
  }

  renderWelcome();
};

void startApplication();
