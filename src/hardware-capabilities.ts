import { execFile } from 'node:child_process';
import fs from 'node:fs';
import { logActivity } from './app-logger';
import type { HardwareCapabilities, VideoEncoderCapability } from './shared-types';

const execute = (file: string, args: string[], timeout = 8_000): Promise<string> =>
  new Promise((resolve, reject) => {
    execFile(file, args, { timeout, windowsHide: true, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => error
        ? reject(new Error(stderr.trim() || error.message))
        : resolve(`${stdout}\n${stderr}`));
  });

type DisplayAdapter = { name: string; deviceName: string; deviceId: string; primary: boolean; active: boolean };
const VIRTUAL_DISPLAY = /virtual|remote|indirect|mirage|dummy|spacedesk|parsec|citrix|vmware|hyper-v|basic display/i;

const getWindowsAdapters = async () => {
  if (process.platform !== 'win32') return { primary: [] as string[], ignored: [] as string[] };
  try {
    const script = String.raw`
Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
public static class EaDisplayDevices {
  [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
  public struct DISPLAY_DEVICE {
    public int cb;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 32)] public string DeviceName;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceString;
    public int StateFlags;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceID;
    [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 128)] public string DeviceKey;
  }
  [DllImport("user32.dll", CharSet = CharSet.Unicode)]
  public static extern bool EnumDisplayDevices(string device, uint index, ref DISPLAY_DEVICE display, uint flags);
}
'@
$items = @()
for ($index = 0; ; $index++) {
  $display = New-Object EaDisplayDevices+DISPLAY_DEVICE
  $display.cb = [Runtime.InteropServices.Marshal]::SizeOf($display)
  if (-not [EaDisplayDevices]::EnumDisplayDevices($null, $index, [ref]$display, 0)) { break }
  $items += [pscustomobject]@{
    name = $display.DeviceString
    deviceName = $display.DeviceName
    deviceId = $display.DeviceID
    primary = (($display.StateFlags -band 4) -ne 0)
    active = (($display.StateFlags -band 1) -ne 0)
  }
}
ConvertTo-Json -InputObject $items -Compress
`;
    const output = await execute('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
    const parsed = JSON.parse(output.trim()) as DisplayAdapter[];
    let displays = Array.isArray(parsed) ? parsed : [parsed];
    let enumerationMethod = 'EnumDisplayDevices';
    if (!displays.length) {
      const fallbackOutput = await execute('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-Command',
        '@(Get-CimInstance Win32_VideoController | Select-Object @{n="name";e={$_.Name}}, @{n="deviceName";e={$_.PNPDeviceID}}, @{n="deviceId";e={$_.PNPDeviceID}}, @{n="primary";e={$false}}, @{n="active";e={$_.ConfigManagerErrorCode -eq 0 -and $_.CurrentHorizontalResolution -gt 0 -and $_.CurrentVerticalResolution -gt 0}}) | ConvertTo-Json -Compress',
      ]);
      const fallback = JSON.parse(fallbackOutput.trim()) as DisplayAdapter | DisplayAdapter[];
      displays = (Array.isArray(fallback) ? fallback : [fallback]).filter(Boolean);
      const firstPhysicalActive = displays.find((adapter) => adapter.active && !VIRTUAL_DISPLAY.test(`${adapter.name} ${adapter.deviceId}`));
      if (firstPhysicalActive) firstPhysicalActive.primary = true;
      enumerationMethod = 'Win32_VideoController fallback';
    }
    const physical = displays.filter((adapter) => adapter.active && !VIRTUAL_DISPLAY.test(`${adapter.name} ${adapter.deviceId}`));
    const declaredPrimary = displays.find((adapter) => adapter.primary);
    const selected = declaredPrimary
      ? physical.find((adapter) => adapter.deviceName === declaredPrimary.deviceName)
      : physical[0];
    const primary = selected?.name ? [selected.name] : [];
    const ignored = displays
      .filter((adapter) => !selected || adapter.deviceName !== selected.deviceName)
      .map((adapter) => adapter.name || adapter.deviceName)
      .filter(Boolean);
    logActivity('INFO', 'hardware.display-adapters.detected', { primary, ignored, displays, enumerationMethod });
    return { primary, ignored };
  } catch (error) {
    logActivity('WARN', 'hardware.adapter-query.failed', error instanceof Error ? error.message : String(error));
    return { primary: [] as string[], ignored: [] as string[] };
  }
};

const getMacAdapters = async () => {
  if (process.platform !== 'darwin') return { primary: [] as string[], ignored: [] as string[] };
  try {
    const output = await execute('system_profiler', ['SPDisplaysDataType', '-json']);
    const report = JSON.parse(output) as {
      SPDisplaysDataType?: Array<{
        _name?: string;
        sppci_model?: string;
        _spdisplays_ndrvs?: Array<{ spdisplays_main?: string }>;
      }>;
    };
    const detected = (report.SPDisplaysDataType ?? []).map((adapter) => ({
      name: adapter.sppci_model || adapter._name || 'Apple VideoToolbox',
      primary: adapter._spdisplays_ndrvs?.some((display) => display.spdisplays_main === 'spdisplays_yes') ?? false,
    }));
    const physical = detected.filter((adapter) => !VIRTUAL_DISPLAY.test(adapter.name));
    const selected = physical.find((adapter) => adapter.primary) ?? physical[0];
    const primary = selected ? [selected.name] : ['Apple VideoToolbox'];
    const ignored = detected.filter((adapter) => adapter !== selected).map((adapter) => adapter.name);
    logActivity('INFO', 'hardware.display-adapters.detected', {
      primary, ignored, displays: detected, enumerationMethod: 'system_profiler primary display',
    });
    return { primary, ignored };
  } catch (error) {
    logActivity('WARN', 'hardware.adapter-query.failed', error instanceof Error ? error.message : String(error));
    return { primary: ['Apple VideoToolbox'], ignored: [] as string[] };
  }
};

const getLinuxDrmAdapters = async () => {
  const drmRoot = '/sys/class/drm';
  const entries = await fs.promises.readdir(drmRoot, { withFileTypes: true });
  const connectedCards = new Set<string>();
  for (const entry of entries) {
    const card = /^(card\d+)-/.exec(entry.name)?.[1];
    if (!card) continue;
    const status = await fs.promises.readFile(`${drmRoot}/${entry.name}/status`, 'utf8').catch(() => '');
    if (status.trim() === 'connected') connectedCards.add(card);
  }
  const vendorNames: Record<string, string> = {
    '0x10de': 'NVIDIA', '0x1002': 'AMD Radeon', '0x8086': 'Intel',
  };
  const detected = await Promise.all([...connectedCards].map(async (card) => {
    const vendor = (await fs.promises.readFile(`${drmRoot}/${card}/device/vendor`, 'utf8').catch(() => '')).trim().toLowerCase();
    return vendorNames[vendor] ? `${vendorNames[vendor]} (${card})` : `Virtual or unsupported GPU ${vendor || 'unknown'} (${card})`;
  }));
  if (!detected.some((name) => !VIRTUAL_DISPLAY.test(name))) {
    throw new Error('No supported physical GPU backs a connected DRM display');
  }
  return detected;
};

const getLinuxAdapters = async () => {
  if (process.platform !== 'linux') return { primary: [] as string[], ignored: [] as string[] };
  try {
    let detected: string[];
    let enumerationMethod: string;
    try {
      detected = await getLinuxDrmAdapters();
      enumerationMethod = 'sysfs connected DRM display';
    } catch {
      const output = await execute('lspci', ['-nn']);
      detected = output.split(/\r?\n/)
        .filter((line) => /VGA compatible controller|3D controller|Display controller/i.test(line))
        .map((line) => line.replace(/^\S+\s+/, '').trim())
        .filter(Boolean);
      enumerationMethod = 'lspci fallback';
    }
    const selected = detected.find((name) => !VIRTUAL_DISPLAY.test(name));
    const primary = selected ? [selected] : [];
    const ignored = detected.filter((name) => name !== selected);
    logActivity('INFO', 'hardware.display-adapters.detected', {
      primary, ignored, displays: detected, enumerationMethod,
    });
    return { primary, ignored };
  } catch (error) {
    logActivity('WARN', 'hardware.adapter-query.failed', error instanceof Error ? error.message : String(error));
    return { primary: [] as string[], ignored: [] as string[] };
  }
};

const getPlatformAdapters = () => process.platform === 'win32'
  ? getWindowsAdapters()
  : process.platform === 'darwin'
    ? getMacAdapters()
    : getLinuxAdapters();

const canEncode = async (ffmpegPath: string, encoder: string, tenBit = false) => {
  const args = [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'color=color=black:size=256x256:rate=1', '-frames:v', '1', '-an',
  ];
  if (tenBit) args.push('-vf', 'format=p010le');
  args.push('-c:v', encoder, '-f', 'null', '-');
  try {
    await execute(ffmpegPath, args);
    logActivity('INFO', 'ffmpeg.encoder.available', { encoder, tenBit });
    return true;
  } catch (error) {
    logActivity('INFO', 'ffmpeg.encoder.unavailable', {
      encoder, tenBit, reason: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const canInitializeCuda = async (ffmpegPath: string) => {
  try {
    await execute(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-init_hw_device', 'cuda=cuda:0',
      '-f', 'lavfi', '-i', 'nullsrc=size=64x64', '-frames:v', '1', '-f', 'null', '-',
    ]);
    return true;
  } catch {
    return false;
  }
};

const canInitializeDevice = async (ffmpegPath: string, specification: string) => {
  try {
    await execute(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-init_hw_device', specification,
      '-f', 'lavfi', '-i', 'nullsrc=size=64x64', '-frames:v', '1', '-f', 'null', '-',
    ]);
    return true;
  } catch {
    return false;
  }
};

const canEncodeVaapi = async (ffmpegPath: string, encoder: string, device: string, tenBit = false) => {
  const format = tenBit ? 'p010le' : 'nv12';
  try {
    await execute(ffmpegPath, [
      '-hide_banner', '-loglevel', 'error', '-vaapi_device', device,
      '-f', 'lavfi', '-i', 'color=color=black:size=256x256:rate=1', '-frames:v', '1', '-an',
      '-vf', `format=${format},hwupload`, '-c:v', encoder, '-f', 'null', '-',
    ]);
    logActivity('INFO', 'ffmpeg.encoder.available', { encoder, tenBit, device });
    return true;
  } catch (error) {
    logActivity('INFO', 'ffmpeg.encoder.unavailable', {
      encoder, tenBit, device, reason: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
};

const availableHardwareDecoders = async (ffmpegPath: string) => {
  try {
    const output = await execute(ffmpegPath, ['-hide_banner', '-decoders']);
    const names = [...output.matchAll(/^\s*V[^\s]*\s+([^\s]+)\s/gm)].map((match) => match[1]);
    return {
      cuvid: names.filter((name) => name.endsWith('_cuvid')),
      qsv: names.filter((name) => name.endsWith('_qsv')),
    };
  } catch {
    return { cuvid: [] as string[], qsv: [] as string[] };
  }
};

type Candidate = Omit<VideoEncoderCapability, 'tenBit'> & { tenBitTest?: boolean; platforms?: NodeJS.Platform[] };
const CANDIDATES: Candidate[] = [
  { id: 'h264_nvenc', label: 'H.264 (NVENC)', vendor: 'NVIDIA', codec: 'H.264', platforms: ['win32', 'linux'] },
  { id: 'hevc_nvenc', label: 'H.265 / HEVC (NVENC)', vendor: 'NVIDIA', codec: 'HEVC', tenBitTest: true, platforms: ['win32', 'linux'] },
  { id: 'av1_nvenc', label: 'AV1 (NVENC)', vendor: 'NVIDIA', codec: 'AV1', platforms: ['win32', 'linux'] },
  { id: 'h264_amf', label: 'H.264 (AMD AMF)', vendor: 'AMD', codec: 'H.264', platforms: ['win32'] },
  { id: 'hevc_amf', label: 'H.265 / HEVC (AMD AMF)', vendor: 'AMD', codec: 'HEVC', tenBitTest: true, platforms: ['win32'] },
  { id: 'av1_amf', label: 'AV1 (AMD AMF)', vendor: 'AMD', codec: 'AV1', platforms: ['win32'] },
  { id: 'h264_qsv', label: 'H.264 (Intel QSV)', vendor: 'Intel', codec: 'H.264', platforms: ['win32', 'linux'] },
  { id: 'hevc_qsv', label: 'H.265 / HEVC (Intel QSV)', vendor: 'Intel', codec: 'HEVC', tenBitTest: true, platforms: ['win32', 'linux'] },
  { id: 'av1_qsv', label: 'AV1 (Intel QSV)', vendor: 'Intel', codec: 'AV1', platforms: ['win32', 'linux'] },
  { id: 'h264_videotoolbox', label: 'H.264 (VideoToolbox)', vendor: 'Apple', codec: 'H.264', platforms: ['darwin'] },
  { id: 'hevc_videotoolbox', label: 'H.265 / HEVC (VideoToolbox)', vendor: 'Apple', codec: 'HEVC', tenBitTest: true, platforms: ['darwin'] },
  { id: 'av1_videotoolbox', label: 'AV1 (VideoToolbox)', vendor: 'Apple', codec: 'AV1', platforms: ['darwin'] },
];

export const detectHardwareCapabilities = async (ffmpegPath: string): Promise<HardwareCapabilities> => {
  const displayAdapters = await getPlatformAdapters();
  const adapters = displayAdapters.primary;
  logActivity('INFO', 'hardware.detection.started', { adapters, ignoredAdapters: displayAdapters.ignored, ffmpegPath });
  const adapterText = adapters.join(' ').toLowerCase();
  const detectedVendors = new Set<VideoEncoderCapability['vendor']>();
  if (/nvidia/.test(adapterText)) detectedVendors.add('NVIDIA');
  if (/\bamd\b|advanced micro devices|radeon/.test(adapterText)) detectedVendors.add('AMD');
  if (/intel/.test(adapterText)) detectedVendors.add('Intel');
  if (process.platform === 'darwin') detectedVendors.add('Apple');
  const candidates = CANDIDATES.filter((candidate) =>
    detectedVendors.has(candidate.vendor) && (!candidate.platforms || candidate.platforms.includes(process.platform)));
  logActivity('INFO', 'hardware.encoder-tests.selected', { count: candidates.length, vendors: [...detectedVendors] });

  const vaapiDevice = process.platform === 'linux' && fs.existsSync('/dev/dri/renderD128') ? '/dev/dri/renderD128' : null;
  const [testedEncoders, cudaAvailable, amfDecodeAvailable, qsvDecodeAvailable, decoders, vaapiAvailable] = await Promise.all([
    Promise.all(candidates.map(async (candidate): Promise<VideoEncoderCapability | null> => {
      if (!await canEncode(ffmpegPath, candidate.id)) return null;
      const tenBit = candidate.tenBitTest ? await canEncode(ffmpegPath, candidate.id, true) : false;
      return {
        id: candidate.id,
        label: candidate.label,
        vendor: candidate.vendor,
        codec: candidate.codec,
        tenBit,
      };
    })),
    detectedVendors.has('NVIDIA')
      ? canInitializeCuda(ffmpegPath)
      : Promise.resolve(false),
    detectedVendors.has('AMD')
      ? canInitializeDevice(ffmpegPath, 'amf=am:0')
      : Promise.resolve(false),
    detectedVendors.has('Intel')
      ? canInitializeDevice(ffmpegPath, 'qsv=qs:hw')
      : Promise.resolve(false),
    availableHardwareDecoders(ffmpegPath),
    vaapiDevice && (detectedVendors.has('AMD') || detectedVendors.has('Intel'))
      ? canInitializeDevice(ffmpegPath, `vaapi=va:${vaapiDevice}`)
      : Promise.resolve(false),
  ]);
  const encoders = testedEncoders.filter((encoder): encoder is VideoEncoderCapability => encoder !== null);
  if (vaapiAvailable && vaapiDevice) {
    const vendor: VideoEncoderCapability['vendor'] = detectedVendors.has('AMD') ? 'AMD' : 'Intel';
    const vaapiCandidates = [
      { id: 'h264_vaapi', label: 'H.264 (VA-API)', codec: 'H.264' as const, tenBit: false },
      { id: 'hevc_vaapi', label: 'H.265 / HEVC (VA-API)', codec: 'HEVC' as const, tenBit: true },
      { id: 'av1_vaapi', label: 'AV1 (VA-API)', codec: 'AV1' as const, tenBit: true },
    ];
    for (const candidate of vaapiCandidates) {
      if (!await canEncodeVaapi(ffmpegPath, candidate.id, vaapiDevice)) continue;
      const tenBit = candidate.tenBit && await canEncodeVaapi(ffmpegPath, candidate.id, vaapiDevice, true);
      encoders.push({ ...candidate, vendor, tenBit });
    }
  }
  const nvdecAvailable = cudaAvailable;
  const result = {
    checkedAt: new Date().toISOString(), adapters, ignoredAdapters: displayAdapters.ignored, cudaAvailable, nvdecAvailable,
    cuvidDecoders: decoders.cuvid, amfDecodeAvailable, qsvDecodeAvailable,
    qsvDecoders: decoders.qsv, vaapiAvailable, vaapiDevice, encoders,
  };
  logActivity('INFO', 'hardware.detection.completed', result);
  return result;
};
