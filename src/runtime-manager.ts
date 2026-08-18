import { app, net, type WebContents } from 'electron';
import { execFile } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import extract from 'extract-zip';
import { FFMPEG_RELEASE_API } from './config';
import type { RuntimePhase, RuntimeState } from './shared-types';

type ReleaseAsset = {
  name: string;
  browser_download_url: string;
  size: number;
  digest?: string | null;
};

type GitHubRelease = {
  tag_name: string;
  assets: ReleaseAsset[];
};

type RuntimeManifest = {
  releaseTag: string;
  assetName: string;
  installedAt: string;
};

type LocalRuntime = {
  available: boolean;
  version: string | null;
};

const executableName = (name: 'ffmpeg' | 'ffprobe') =>
  process.platform === 'win32' ? `${name}.exe` : name;

const getRuntimePaths = () => {
  const root = app.isPackaged ? path.dirname(process.execPath) : process.cwd();
  const lib = path.join(root, 'lib');
  return {
    root,
    lib,
    ffmpeg: path.join(lib, executableName('ffmpeg')),
    ffprobe: path.join(lib, executableName('ffprobe')),
    manifest: path.join(lib, 'ffmpeg-runtime.json'),
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

const getVersion = (output: string) =>
  output.match(/ffmpeg version\s+([^\s]+)/i)?.[1] ?? output.split(/\r?\n/, 1)[0] ?? null;

const inspectLocalRuntime = async (ffmpeg: string, ffprobe: string): Promise<LocalRuntime> => {
  if (!fs.existsSync(ffmpeg) || !fs.existsSync(ffprobe)) {
    return { available: false, version: null };
  }

  try {
    const [ffmpegOutput] = await Promise.all([
      execute(ffmpeg, ['-version']),
      execute(ffprobe, ['-version']),
    ]);
    return { available: true, version: getVersion(ffmpegOutput) };
  } catch {
    return { available: false, version: null };
  }
};

const readManifest = async (manifestPath: string): Promise<RuntimeManifest | null> => {
  try {
    const contents = await fs.promises.readFile(manifestPath, 'utf8');
    return JSON.parse(contents) as RuntimeManifest;
  } catch {
    return null;
  }
};

const fetchLatestRelease = async (): Promise<GitHubRelease> => {
  const response = await net.fetch(FFMPEG_RELEASE_API, {
    headers: {
      Accept: 'application/vnd.github+json',
      'User-Agent': `EA-Media-Tools/${app.getVersion()}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status}`);
  return response.json() as Promise<GitHubRelease>;
};

const selectAsset = (assets: ReleaseAsset[]): ReleaseAsset => {
  const patterns: Partial<Record<NodeJS.Platform, Partial<Record<NodeJS.Architecture, RegExp>>>> = {
    win32: {
      x64: /_portable_win64-clang-gpl\.zip$/i,
      arm64: /_portable_winarm64-clang-gpl\.zip$/i,
    },
  };
  const pattern = patterns[process.platform]?.[process.arch];
  if (!pattern) {
    throw new Error(`No supported Jellyfin FFmpeg package for ${process.platform}/${process.arch}`);
  }
  const asset = assets.find((candidate) => pattern.test(candidate.name));
  if (!asset) {
    throw new Error(`The latest release has no FFmpeg asset for ${process.platform}/${process.arch}`);
  }
  return asset;
};

const downloadAsset = async (
  asset: ReleaseAsset,
  destination: string,
  onProgress: (progress: number) => void,
) => {
  const response = await net.fetch(asset.browser_download_url, {
    headers: { 'User-Agent': `EA-Media-Tools/${app.getVersion()}` },
  });
  if (!response.ok || !response.body) {
    throw new Error(`FFmpeg download failed with HTTP ${response.status}`);
  }

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
      if (!file.write(chunk)) {
        await new Promise<void>((resolve) => file.once('drain', resolve));
      }
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
  const stream = fs.createReadStream(archivePath);
  for await (const chunk of stream) hash.update(chunk);
  if (hash.digest('hex').toLowerCase() !== expected) {
    throw new Error('The downloaded FFmpeg archive failed its SHA-256 check');
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

const installRuntime = async (
  release: GitHubRelease,
  asset: ReleaseAsset,
  libDirectory: string,
  notify: (phase: RuntimePhase, message: string, progress?: number | null) => void,
) => {
  const temporaryDirectory = await fs.promises.mkdtemp(
    path.join(app.getPath('temp'), 'ea-media-tools-ffmpeg-'),
  );
  const archivePath = path.join(temporaryDirectory, asset.name);
  const extractionPath = path.join(temporaryDirectory, 'extracted');

  try {
    notify('downloading', `Downloading ${asset.name}`, 0);
    await downloadAsset(asset, archivePath, (progress) =>
      notify('downloading', `Downloading FFmpeg · ${progress}%`, progress));
    await verifyDigest(archivePath, asset.digest);

    notify('extracting', 'Extracting the FFmpeg runtime', null);
    await fs.promises.mkdir(extractionPath, { recursive: true });
    await extract(archivePath, { dir: extractionPath });

    const stagedFfmpeg = await findFile(extractionPath, executableName('ffmpeg'));
    const stagedFfprobe = await findFile(extractionPath, executableName('ffprobe'));
    if (!stagedFfmpeg || !stagedFfprobe || path.dirname(stagedFfmpeg) !== path.dirname(stagedFfprobe)) {
      throw new Error('The FFmpeg archive did not contain a matching ffmpeg/ffprobe pair');
    }

    notify('verifying', 'Verifying the downloaded FFmpeg runtime', null);
    await Promise.all([execute(stagedFfmpeg, ['-h']), execute(stagedFfprobe, ['-version'])]);

    await fs.promises.mkdir(libDirectory, { recursive: true });
    await fs.promises.cp(path.dirname(stagedFfmpeg), libDirectory, {
      recursive: true,
      force: true,
    });
    const manifest: RuntimeManifest = {
      releaseTag: release.tag_name,
      assetName: asset.name,
      installedAt: new Date().toISOString(),
    };
    await fs.promises.writeFile(
      path.join(libDirectory, 'ffmpeg-runtime.json'),
      `${JSON.stringify(manifest, null, 2)}\n`,
      'utf8',
    );
  } finally {
    await fs.promises.rm(temporaryDirectory, { recursive: true, force: true });
  }
};

export const initializeRuntime = async (webContents: WebContents): Promise<RuntimeState> => {
  const runtimePaths = getRuntimePaths();
  const baseState: RuntimeState = {
    phase: 'checking-local',
    message: 'Checking the local FFmpeg runtime',
    progress: null,
    appVersion: app.getVersion(),
    isPackaged: app.isPackaged,
    updateEnabled: app.isPackaged,
    ffmpegAvailable: false,
    ffmpegPath: runtimePaths.ffmpeg,
    ffprobePath: runtimePaths.ffprobe,
    ffmpegVersion: null,
    releaseTag: null,
  };

  const notify = (phase: RuntimePhase, message: string, progress: number | null = null) => {
    Object.assign(baseState, { phase, message, progress });
    if (!webContents.isDestroyed()) webContents.send('runtime:progress', { ...baseState });
  };

  notify('checking-local', 'Checking the local FFmpeg runtime');
  let local = await inspectLocalRuntime(runtimePaths.ffmpeg, runtimePaths.ffprobe);
  Object.assign(baseState, {
    ffmpegAvailable: local.available,
    ffmpegVersion: local.version,
  });

  if (!app.isPackaged) {
    notify('development', local.available
      ? `Development mode · FFmpeg ${local.version ?? 'detected'} · downloads disabled`
      : 'Development mode · FFmpeg downloads disabled');
    return { ...baseState };
  }

  try {
    notify('checking-release', 'Checking the latest stable Jellyfin FFmpeg release');
    const [release, manifest] = await Promise.all([
      fetchLatestRelease(),
      readManifest(runtimePaths.manifest),
    ]);
    baseState.releaseTag = release.tag_name;

    if (local.available && manifest?.releaseTag === release.tag_name) {
      notify('ready', `FFmpeg ${local.version ?? release.tag_name} is ready`);
      return { ...baseState };
    }

    const asset = selectAsset(release.assets);
    await installRuntime(release, asset, runtimePaths.lib, notify);
    local = await inspectLocalRuntime(runtimePaths.ffmpeg, runtimePaths.ffprobe);
    if (!local.available) throw new Error('FFmpeg verification failed after installation');

    Object.assign(baseState, {
      ffmpegAvailable: true,
      ffmpegVersion: local.version,
      releaseTag: release.tag_name,
    });
    notify('ready', `FFmpeg ${local.version ?? release.tag_name} is ready`);
  } catch (error) {
    const detail = error instanceof Error ? error.message : 'Unknown FFmpeg runtime error';
    if (local.available) {
      notify('ready', `Using FFmpeg ${local.version ?? 'local'} · update check failed: ${detail}`);
    } else {
      notify('error', detail);
    }
  }

  return { ...baseState };
};
