import { app, net, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {
  CCEXTRACTOR_RELEASE_API, FFMPEG_RELEASE_API, FFMPEG_RELEASES_API, RSGAIN_RELEASE_API,
} from './config';
import { logActivity } from './app-logger';
import type { RuntimePhase, RuntimeState } from './shared-types';

type FfmpegChannel = RuntimeState['ffmpegChannel'];
type ReleaseAsset = { name: string; browser_download_url: string; size: number; digest?: string | null };
type GitHubRelease = { tag_name: string; prerelease?: boolean; draft?: boolean; assets: ReleaseAsset[] };
type RuntimeManifest = { releaseTag: string; assetName: string; installedAt: string };
type LocalRuntime = { available: boolean; version: string | null };
type RuntimePaths = { directory: string; ffmpeg: string; ffprobe: string; manifest: string };
type Notify = (phase: RuntimePhase, message: string, progress?: number | null) => void;

const executableName = (name: 'ffmpeg' | 'ffprobe' | 'rsgain') =>
  process.platform === 'win32' ? `${name}.exe` : name;

const getManagedRoot = () => app.isPackaged
  ? process.platform === 'win32'
    ? path.dirname(process.execPath)
    : path.join(app.getPath('userData'), 'runtime')
  : process.cwd();

const ffmpegPaths = (channel: FfmpegChannel): RuntimePaths => {
  const directory = path.join(getManagedRoot(), 'lib', `ffmpeg-${channel}`);
  return {
    directory,
    ffmpeg: path.join(directory, executableName('ffmpeg')),
    ffprobe: path.join(directory, executableName('ffprobe')),
    manifest: path.join(directory, 'ffmpeg-runtime.json'),
  };
};

const rsgainPaths = () => {
  const directory = path.join(getManagedRoot(), 'lib', 'rsgain');
  return {
    directory,
    executable: path.join(directory, executableName('rsgain')),
    manifest: path.join(directory, 'rsgain-runtime.json'),
  };
};

const ccextractorPaths = () => {
  const directory = path.join(getManagedRoot(), 'lib', 'ccextractor');
  return {
    directory,
    executable: path.join(directory, process.platform === 'win32' ? 'ccextractor.exe' : 'ccextractor'),
    manifest: path.join(directory, 'ccextractor-runtime.json'),
  };
};

const execute = (file: string, args: string[], timeout = 20_000): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new Error(`${path.basename(file)} failed: ${error.message}`));
          return;
        }
        resolve(`${stdout}\n${stderr}`.trim());
      });
  });

const getFfmpegVersion = (output: string) =>
  output.match(/ffmpeg version\s+([^\s]+)/i)?.[1] ?? output.split(/\r?\n/, 1)[0] ?? null;
const getRsgainVersion = (output: string) =>
  output.match(/rsgain\s+v?([^\s]+)/i)?.[1] ?? output.split(/\r?\n/, 1)[0] ?? null;
const getCcExtractorVersion = (output: string) =>
  output.match(/ccextractor[^0-9]*v?([0-9][^\s]*)/i)?.[1] ?? output.split(/\r?\n/, 1)[0] ?? null;

const inspectFfmpeg = async (paths: RuntimePaths): Promise<LocalRuntime> => {
  try {
    const [ffmpegOutput] = await Promise.all([
      execute(paths.ffmpeg, ['-version']),
      execute(paths.ffprobe, ['-version']),
    ]);
    return { available: true, version: getFfmpegVersion(ffmpegOutput) };
  } catch {
    return { available: false, version: null };
  }
};

const inspectRsgain = async (executable: string): Promise<LocalRuntime> => {
  try {
    return { available: true, version: getRsgainVersion(await execute(executable, ['--version'])) };
  } catch {
    return { available: false, version: null };
  }
};

const inspectCcExtractor = async (executable: string): Promise<LocalRuntime> => {
  try {
    return { available: true, version: getCcExtractorVersion(await execute(executable, ['--version'])) };
  } catch {
    return { available: false, version: null };
  }
};

const readManifest = async (manifestPath: string): Promise<RuntimeManifest | null> => {
  try {
    return JSON.parse(await fs.promises.readFile(manifestPath, 'utf8')) as RuntimeManifest;
  } catch {
    return null;
  }
};

const githubHeaders = () => ({
  Accept: 'application/vnd.github+json',
  'User-Agent': `EA-Media-Tools/${app.getVersion()}`,
  'X-GitHub-Api-Version': '2022-11-28',
});

const fetchJson = async <T>(url: string): Promise<T> => {
  const response = await net.fetch(url, { headers: githubHeaders() });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  return response.json() as Promise<T>;
};

const fetchStableRelease = () => fetchJson<GitHubRelease>(FFMPEG_RELEASE_API);
const fetchPrerelease = async () => {
  const releases = await fetchJson<GitHubRelease[]>(FFMPEG_RELEASES_API);
  const release = releases.find((candidate) => candidate.prerelease && !candidate.draft);
  if (!release) throw new Error('GitHub did not return a Jellyfin FFmpeg prerelease');
  return release;
};
const fetchRsgainRelease = () => fetchJson<GitHubRelease>(RSGAIN_RELEASE_API);
const fetchCcExtractorRelease = () => fetchJson<GitHubRelease>(CCEXTRACTOR_RELEASE_API);

const selectFfmpegAsset = (assets: ReleaseAsset[]): ReleaseAsset => {
  const patterns: Partial<Record<NodeJS.Platform, Partial<Record<NodeJS.Architecture, RegExp>>>> = {
    win32: { x64: /_portable_win64-clang-gpl\.zip$/i, arm64: /_portable_winarm64-clang-gpl\.zip$/i },
    darwin: { x64: /_portable_mac64-gpl\.tar\.xz$/i, arm64: /_portable_macarm64-gpl\.tar\.xz$/i },
    linux: { x64: /_portable_linux64-gpl\.tar\.xz$/i, arm64: /_portable_linuxarm64-gpl\.tar\.xz$/i },
  };
  const pattern = patterns[process.platform]?.[process.arch];
  if (!pattern) throw new Error(`No Jellyfin FFmpeg package supports ${process.platform}/${process.arch}`);
  const asset = assets.find((candidate) => pattern.test(candidate.name));
  if (!asset) throw new Error(`The Jellyfin FFmpeg release has no asset for ${process.platform}/${process.arch}`);
  return asset;
};

const selectRsgainAsset = (assets: ReleaseAsset[]): ReleaseAsset | null => {
  const patterns: Partial<Record<NodeJS.Platform, Partial<Record<NodeJS.Architecture, RegExp>>>> = {
    win32: { x64: /-win64\.zip$/i },
    darwin: { x64: /-macOS-x86_64\.zip$/i, arm64: /-macOS-arm64\.zip$/i },
    linux: { x64: /-Linux\.tar\.xz$/i },
  };
  const pattern = patterns[process.platform]?.[process.arch];
  return pattern ? assets.find((candidate) => pattern.test(candidate.name)) ?? null : null;
};

const selectCcExtractorAsset = (assets: ReleaseAsset[]): ReleaseAsset | null => {
  if (process.platform === 'win32') {
    return assets.find((candidate) => /_win_portable\.zip$/i.test(candidate.name)) ?? null;
  }
  if (process.platform === 'linux' && process.arch === 'x64') {
    return assets.find((candidate) => /ccextractor-linux-systemlibs-x86_64\.tar\.gz$/i.test(candidate.name)) ?? null;
  }
  return null;
};

const extractArchive = async (archivePath: string, extractionPath: string) => {
  if (/\.zip$/i.test(archivePath)) {
    await execute('tar', ['-xf', archivePath, '-C', extractionPath], 120_000);
    return;
  }
  if (/\.tar\.xz$/i.test(archivePath)) {
    await execute('tar', ['-xJf', archivePath, '-C', extractionPath], 120_000);
    return;
  }
  if (/\.tar\.gz$/i.test(archivePath)) {
    await execute('tar', ['-xzf', archivePath, '-C', extractionPath], 120_000);
    return;
  }
  throw new Error(`Unsupported runtime archive: ${path.basename(archivePath)}`);
};

const downloadAsset = async (
  asset: ReleaseAsset,
  destination: string,
  component: string,
  onProgress: (progress: number) => void,
) => {
  const response = await net.fetch(asset.browser_download_url, {
    headers: { 'User-Agent': `EA-Media-Tools/${app.getVersion()}` },
  });
  if (!response.ok || !response.body) throw new Error(`${component} download failed with HTTP ${response.status}`);
  const total = Number(response.headers.get('content-length')) || asset.size;
  const reader = response.body.getReader();
  const file = fs.createWriteStream(destination);
  let downloaded = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      const chunk = Buffer.from(value);
      downloaded += chunk.length;
      if (!file.write(chunk)) await new Promise<void>((resolve) => file.once('drain', resolve));
      if (total > 0) onProgress(Math.min(100, Math.round((downloaded / total) * 100)));
    }
    await new Promise<void>((resolve, reject) => {
      file.once('error', reject);
      file.end(resolve);
    });
  } catch (error) {
    file.destroy();
    throw error;
  }
};

const verifyDigest = async (archivePath: string, digest?: string | null) => {
  if (!digest?.startsWith('sha256:')) return;
  const expected = digest.slice('sha256:'.length).toLowerCase();
  const hash = crypto.createHash('sha256');
  for await (const chunk of fs.createReadStream(archivePath)) hash.update(chunk);
  if (hash.digest('hex').toLowerCase() !== expected) {
    throw new Error('The downloaded runtime archive failed its SHA-256 check');
  }
};

const findFile = async (directory: string, filename: string): Promise<string | null> => {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && entry.name.toLowerCase() === filename.toLowerCase()) return fullPath;
    if (entry.isDirectory()) {
      const nested = await findFile(fullPath, filename);
      if (nested) return nested;
    }
  }
  return null;
};

const findFileMatching = async (directory: string, pattern: RegExp): Promise<string | null> => {
  const entries = await fs.promises.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isFile() && pattern.test(entry.name)) return fullPath;
    if (entry.isDirectory()) {
      const nested = await findFileMatching(fullPath, pattern);
      if (nested) return nested;
    }
  }
  return null;
};

const replaceDirectory = async (source: string, destination: string) => {
  const staged = `${destination}.next`;
  await fs.promises.rm(staged, { recursive: true, force: true });
  await fs.promises.mkdir(path.dirname(destination), { recursive: true });
  await fs.promises.cp(source, staged, { recursive: true, force: true });
  await fs.promises.rm(destination, { recursive: true, force: true });
  await fs.promises.rename(staged, destination);
};

const installFfmpegLicenses = async (releaseTag: string, assetName: string, directory: string) => {
  if (!/^[A-Za-z0-9._-]+$/.test(releaseTag)) throw new Error('The FFmpeg release tag is not safe');
  const files = [
    ['LICENSE.md', 'FFMPEG-LICENSE.md'],
    ['COPYING.GPLv2', 'COPYING.GPLv2'],
    ['COPYING.GPLv3', 'COPYING.GPLv3'],
  ] as const;
  const baseUrl = `https://raw.githubusercontent.com/jellyfin/jellyfin-ffmpeg/${releaseTag}`;
  await Promise.all(files.map(async ([upstream, installed]) => {
    const response = await net.fetch(`${baseUrl}/${upstream}`, {
      headers: { 'User-Agent': `EA-Media-Tools/${app.getVersion()}` },
    });
    if (!response.ok) throw new Error(`Unable to retrieve the FFmpeg license file ${upstream}`);
    await fs.promises.writeFile(path.join(directory, installed), await response.text(), 'utf8');
  }));
  const sourceUrl = `https://github.com/jellyfin/jellyfin-ffmpeg/archive/refs/tags/${releaseTag}.tar.gz`;
  await fs.promises.writeFile(path.join(directory, 'FFMPEG-THIRD-PARTY-NOTICE.txt'), [
    'Jellyfin FFmpeg — Third-Party Runtime Notice',
    '=============================================', '',
    `Installed release: ${releaseTag}`, `Installed asset: ${assetName}`, '',
    'This runtime was downloaded unmodified from the Jellyfin FFmpeg project.',
    'It is a separate command-line program and is not covered by the EA Media Tools MIT License.',
    `Corresponding source and build scripts: ${sourceUrl}`,
    `Release page: https://github.com/jellyfin/jellyfin-ffmpeg/releases/tag/${releaseTag}`, '',
  ].join('\n'), 'utf8');
};

const writeManifest = (destination: string, release: GitHubRelease, asset: ReleaseAsset) =>
  fs.promises.writeFile(destination, `${JSON.stringify({
    releaseTag: release.tag_name,
    assetName: asset.name,
    installedAt: new Date().toISOString(),
  } satisfies RuntimeManifest, null, 2)}\n`, 'utf8');

const installFfmpeg = async (
  release: GitHubRelease, asset: ReleaseAsset, paths: RuntimePaths, label: string, notify: Notify,
) => {
  const temporary = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'ea-media-tools-ffmpeg-'));
  const archive = path.join(temporary, asset.name);
  const extracted = path.join(temporary, 'extracted');
  try {
    notify('downloading', `Downloading ${label} FFmpeg · 0%`, 0);
    await downloadAsset(asset, archive, `${label} FFmpeg`, (progress) =>
      notify('downloading', `Downloading ${label} FFmpeg · ${progress}%`, progress));
    await verifyDigest(archive, asset.digest);
    notify('extracting', `Extracting ${label} FFmpeg`, null);
    await fs.promises.mkdir(extracted, { recursive: true });
    await extractArchive(archive, extracted);
    const ffmpeg = await findFile(extracted, executableName('ffmpeg'));
    const ffprobe = await findFile(extracted, executableName('ffprobe'));
    if (!ffmpeg || !ffprobe || path.dirname(ffmpeg) !== path.dirname(ffprobe)) {
      throw new Error(`The ${label} FFmpeg archive did not contain an ffmpeg/ffprobe pair`);
    }
    notify('verifying', `Verifying ${label} FFmpeg`, null);
    await Promise.all([execute(ffmpeg, ['-h']), execute(ffprobe, ['-version'])]);
    await replaceDirectory(path.dirname(ffmpeg), paths.directory);
    if (process.platform !== 'win32') {
      await Promise.all([fs.promises.chmod(paths.ffmpeg, 0o755), fs.promises.chmod(paths.ffprobe, 0o755)]);
    }
    await installFfmpegLicenses(release.tag_name, asset.name, paths.directory);
    await writeManifest(paths.manifest, release, asset);
  } finally {
    await fs.promises.rm(temporary, { recursive: true, force: true });
  }
};

const ensureFfmpeg = async (channel: FfmpegChannel, notify: Notify): Promise<LocalRuntime> => {
  const paths = ffmpegPaths(channel);
  const label = channel === 'stable' ? 'stable' : 'pre-release';
  notify('checking-release', `Checking the latest ${label} Jellyfin FFmpeg release`);
  const release = channel === 'stable' ? await fetchStableRelease() : await fetchPrerelease();
  const [local, manifest] = await Promise.all([inspectFfmpeg(paths), readManifest(paths.manifest)]);
  if (local.available && manifest?.releaseTag === release.tag_name) return local;
  await installFfmpeg(release, selectFfmpegAsset(release.assets), paths, label, notify);
  const installed = await inspectFfmpeg(paths);
  if (!installed.available) throw new Error(`${label} FFmpeg verification failed after installation`);
  return installed;
};

const ensureRsgain = async (notify: Notify): Promise<LocalRuntime> => {
  const paths = rsgainPaths();
  notify('checking-release', 'Checking the rsgain 3.7 runtime');
  const release = await fetchRsgainRelease();
  const asset = selectRsgainAsset(release.assets);
  if (!asset) {
    logActivity('WARN', 'runtime.rsgain.unsupported', { platform: process.platform, arch: process.arch });
    return { available: false, version: null };
  }
  const [local, manifest] = await Promise.all([inspectRsgain(paths.executable), readManifest(paths.manifest)]);
  if (local.available && manifest?.releaseTag === release.tag_name) return local;
  const temporary = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'ea-media-tools-rsgain-'));
  const archive = path.join(temporary, asset.name);
  const extracted = path.join(temporary, 'extracted');
  try {
    notify('downloading', 'Downloading rsgain 3.7 · 0%', 0);
    await downloadAsset(asset, archive, 'rsgain', (progress) =>
      notify('downloading', `Downloading rsgain 3.7 · ${progress}%`, progress));
    await verifyDigest(archive, asset.digest);
    notify('extracting', 'Extracting rsgain 3.7', null);
    await fs.promises.mkdir(extracted, { recursive: true });
    await extractArchive(archive, extracted);
    const rsgain = await findFile(extracted, executableName('rsgain'));
    if (!rsgain) throw new Error('The rsgain archive did not contain its executable');
    notify('verifying', 'Verifying rsgain 3.7', null);
    await execute(rsgain, ['--version']);
    await replaceDirectory(path.dirname(rsgain), paths.directory);
    if (process.platform !== 'win32') await fs.promises.chmod(paths.executable, 0o755);
    await fs.promises.writeFile(path.join(paths.directory, 'RSGAIN-THIRD-PARTY-NOTICE.txt'), [
      'rsgain — Third-Party Runtime Notice',
      '===================================', '',
      `Installed release: ${release.tag_name}`, `Installed asset: ${asset.name}`,
      'Project: https://github.com/complexlogic/rsgain',
      'License: BSD-2-Clause (see the license material included in this runtime directory).', '',
    ].join('\n'), 'utf8');
    await writeManifest(paths.manifest, release, asset);
  } finally {
    await fs.promises.rm(temporary, { recursive: true, force: true });
  }
  const installed = await inspectRsgain(paths.executable);
  if (!installed.available) throw new Error('rsgain verification failed after installation');
  return installed;
};

const ensureCcExtractor = async (notify: Notify): Promise<LocalRuntime> => {
  const paths = ccextractorPaths();
  notify('checking-release', 'Checking the latest CCExtractor runtime');
  const release = await fetchCcExtractorRelease();
  const asset = selectCcExtractorAsset(release.assets);
  if (!asset) {
    logActivity('WARN', 'runtime.ccextractor.unsupported', { platform: process.platform, arch: process.arch });
    return { available: false, version: null };
  }
  const [local, manifest] = await Promise.all([
    inspectCcExtractor(paths.executable), readManifest(paths.manifest),
  ]);
  if (local.available && manifest?.releaseTag === release.tag_name) return local;

  const temporary = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'ea-media-tools-ccextractor-'));
  const archive = path.join(temporary, asset.name);
  const extracted = path.join(temporary, 'extracted');
  try {
    notify('downloading', `Downloading CCExtractor ${release.tag_name} · 0%`, 0);
    await downloadAsset(asset, archive, 'CCExtractor', (progress) =>
      notify('downloading', `Downloading CCExtractor ${release.tag_name} · ${progress}%`, progress));
    await verifyDigest(archive, asset.digest);
    notify('extracting', `Extracting CCExtractor ${release.tag_name}`, null);
    await fs.promises.mkdir(extracted, { recursive: true });
    await extractArchive(archive, extracted);
    const executable = process.platform === 'win32'
      ? await findFileMatching(extracted, /^ccextractor(?:winfull|win)?\.exe$/i)
        ?? await findFileMatching(extracted, /^ccextractor.*\.exe$/i)
      : await findFile(extracted, 'ccextractor');
    if (!executable) throw new Error('The CCExtractor archive did not contain its command-line executable');
    notify('verifying', `Verifying CCExtractor ${release.tag_name}`, null);
    await execute(executable, ['--version']);
    await replaceDirectory(path.dirname(executable), paths.directory);
    const installedName = path.join(paths.directory, path.basename(executable));
    if (installedName.toLowerCase() !== paths.executable.toLowerCase()) {
      await fs.promises.rename(installedName, paths.executable);
    }
    if (process.platform !== 'win32') await fs.promises.chmod(paths.executable, 0o755);
    await fs.promises.writeFile(path.join(paths.directory, 'CCEXTRACTOR-THIRD-PARTY-NOTICE.txt'), [
      'CCExtractor — Third-Party Runtime Notice',
      '=========================================', '',
      `Installed release: ${release.tag_name}`, `Installed asset: ${asset.name}`,
      'Project: https://github.com/CCExtractor/ccextractor',
      'License: GNU General Public License v2.0 (see the license material included with this runtime).', '',
    ].join('\n'), 'utf8');
    await writeManifest(paths.manifest, release, asset);
  } finally {
    await fs.promises.rm(temporary, { recursive: true, force: true });
  }
  const installed = await inspectCcExtractor(paths.executable);
  if (!installed.available) throw new Error('CCExtractor verification failed after installation');
  return installed;
};

const stateForManagedChannel = async (
  channel: FfmpegChannel, phase: RuntimePhase, message: string,
): Promise<RuntimeState> => {
  const paths = ffmpegPaths(channel);
  const gainPaths = rsgainPaths();
  const captionPaths = ccextractorPaths();
  const [ffmpeg, ffmpegManifest, rsgain, rsgainManifest, ccextractor, ccextractorManifest] = await Promise.all([
    inspectFfmpeg(paths), readManifest(paths.manifest),
    inspectRsgain(gainPaths.executable), readManifest(gainPaths.manifest),
    inspectCcExtractor(captionPaths.executable), readManifest(captionPaths.manifest),
  ]);
  return {
    phase, message, progress: null, appVersion: app.getVersion(), isPackaged: app.isPackaged,
    updateEnabled: app.isPackaged && process.platform !== 'linux',
    ffmpegAvailable: ffmpeg.available, ffmpegPath: paths.ffmpeg, ffprobePath: paths.ffprobe,
    ffmpegVersion: ffmpeg.version, releaseTag: ffmpegManifest?.releaseTag ?? null,
    ffmpegChannel: channel,
    rsgainAvailable: rsgain.available, rsgainPath: gainPaths.executable,
    rsgainVersion: rsgain.version ?? rsgainManifest?.releaseTag ?? null,
    ccextractorAvailable: ccextractor.available, ccextractorPath: captionPaths.executable,
    // CCExtractor 0.96.6's official Windows binary reports 0.96.5 internally;
    // the verified release manifest is authoritative for the installed package.
    ccextractorVersion: ccextractorManifest?.releaseTag ?? ccextractor.version,
  };
};

const developmentState = async (channel: FfmpegChannel): Promise<RuntimeState> => {
  const unstable = channel === 'unstable';
  const ffmpegPath = unstable
    ? process.env.EA_FFMPEG_UNSTABLE_PATH || process.env.EA_FFMPEG_PATH
    : process.env.EA_FFMPEG_PATH;
  const ffprobePath = unstable
    ? process.env.EA_FFPROBE_UNSTABLE_PATH || process.env.EA_FFPROBE_PATH
    : process.env.EA_FFPROBE_PATH;
  const paths: RuntimePaths = {
    directory: '', ffmpeg: ffmpegPath || (process.platform === 'win32' ? 'jellyffmpeg' : 'ffmpeg'),
    ffprobe: ffprobePath || 'ffprobe', manifest: '',
  };
  const local = await inspectFfmpeg(paths);
  return {
    phase: 'development',
    message: local.available
      ? `Development mode · FFmpeg ${local.version ?? 'detected'} · downloads disabled`
      : 'Development mode · FFmpeg downloads disabled',
    progress: null, appVersion: app.getVersion(), isPackaged: false, updateEnabled: false,
    ffmpegAvailable: local.available, ffmpegPath: paths.ffmpeg, ffprobePath: paths.ffprobe,
    ffmpegVersion: local.version, releaseTag: null, ffmpegChannel: channel,
    rsgainAvailable: false, rsgainPath: '', rsgainVersion: null,
    ccextractorAvailable: false, ccextractorPath: '', ccextractorVersion: null,
  };
};

export const selectRuntimeChannel = async (useStable: boolean): Promise<RuntimeState> => {
  const channel: FfmpegChannel = useStable ? 'stable' : 'unstable';
  if (!app.isPackaged) return developmentState(channel);
  const state = await stateForManagedChannel(channel, 'ready', '');
  state.message = state.ffmpegAvailable
    ? `${channel === 'stable' ? 'Stable' : 'Pre-release'} FFmpeg ${state.releaseTag ?? state.ffmpegVersion ?? 'ready'} is active`
    : `${channel === 'stable' ? 'Stable' : 'Pre-release'} FFmpeg is unavailable`;
  if (!state.ffmpegAvailable) state.phase = 'error';
  return state;
};

export const initializeRuntime = async (webContents: WebContents, useStable = true): Promise<RuntimeState> => {
  const activeChannel: FfmpegChannel = useStable ? 'stable' : 'unstable';
  if (!app.isPackaged) return developmentState(activeChannel);
  let state = await stateForManagedChannel(activeChannel, 'checking-local', 'Checking managed runtimes');
  const notify: Notify = (phase, message, progress = null) => {
    state = { ...state, phase, message, progress };
    logActivity(phase === 'error' ? 'ERROR' : 'INFO', 'runtime.progress', { phase, message, progress });
    if (!webContents.isDestroyed()) webContents.send('runtime:progress', { ...state });
  };
  notify('checking-local', 'Checking managed runtimes');
  const errors: string[] = [];
  const channels: FfmpegChannel[] = activeChannel === 'stable' ? ['stable', 'unstable'] : ['unstable', 'stable'];
  for (const channel of channels) {
    try {
      await ensureFfmpeg(channel, notify);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      errors.push(`${channel}: ${detail}`);
      logActivity('ERROR', 'runtime.ffmpeg.failed', { channel, detail });
    }
  }
  try {
    await ensureRsgain(notify);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    errors.push(`rsgain: ${detail}`);
    logActivity('ERROR', 'runtime.rsgain.failed', { detail });
  }
  try {
    await ensureCcExtractor(notify);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    errors.push(`ccextractor: ${detail}`);
    logActivity('ERROR', 'runtime.ccextractor.failed', { detail });
  }
  state = await stateForManagedChannel(activeChannel, 'ready', '');
  if (state.ffmpegAvailable) {
    const label = activeChannel === 'stable' ? 'Stable' : 'Pre-release';
    state.message = `${label} FFmpeg ${state.releaseTag ?? state.ffmpegVersion ?? 'ready'} is ready`
      + (errors.length ? ` · ${errors.length} optional runtime update${errors.length === 1 ? '' : 's'} failed` : '');
    notify('ready', state.message);
  } else {
    state.message = errors.find((message) => message.startsWith(`${activeChannel}:`))
      ?? `${activeChannel} FFmpeg is unavailable`;
    notify('error', state.message);
  }
  return { ...state };
};
