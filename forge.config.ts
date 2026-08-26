import type { ForgeConfig } from '@electron-forge/shared-types';
import { MakerSquirrel } from '@electron-forge/maker-squirrel';
import { MakerZIP } from '@electron-forge/maker-zip';
import { MakerDeb } from '@electron-forge/maker-deb';
import { MakerWix } from '@electron-forge/maker-wix';
import { VitePlugin } from '@electron-forge/plugin-vite';
import { FusesPlugin } from '@electron-forge/plugin-fuses';
import { PublisherGithub } from '@electron-forge/publisher-github';
import { FuseV1Options, FuseVersion } from '@electron/fuses';
import path from 'node:path';
import fs from 'node:fs';

const certificateFile = process.env.WINDOWS_CERTIFICATE_FILE;
const certificatePassword = process.env.WINDOWS_CERTIFICATE_PASSWORD;
const releaseArch = process.env.EA_RELEASE_ARCH;
const appVersion = JSON.parse(fs.readFileSync(path.resolve('package.json'), 'utf8')).version as string;
const windowsSign = certificateFile && certificatePassword
  ? { certificateFile, certificatePassword }
  : undefined;

const config: ForgeConfig = {
  packagerConfig: {
    asar: true,
    executableName: 'ea-media-tools',
    extraResource: [path.resolve('presets.ini')],
    windowsSign,
  },
  rebuildConfig: {},
  publishers: [
    new PublisherGithub({
      repository: {
        owner: 'eaforlife',
        name: 'media-converter',
      },
      draft: false,
      prerelease: false,
      generateReleaseNotes: true,
    }),
  ],
  makers: [
    new MakerSquirrel({
      name: releaseArch ? `ea_media_tools_${releaseArch}` : 'ea_media_tools',
      setupExe: releaseArch
        ? `EA-Media-Tools-${appVersion}-${releaseArch}-Setup.exe`
        : `EA-Media-Tools-${appVersion}-Setup.exe`,
      noMsi: true,
      windowsSign,
    }),
    ...(process.env.EA_BUILD_WIX === '1' ? [new MakerWix({
      name: 'EA Media Tools',
      manufacturer: 'eaforlife',
      defaultInstallMode: 'perMachine',
      ui: { chooseDirectory: true },
      windowsSign,
    })] : []),
    new MakerZIP({}, ['darwin']),
    new MakerDeb({
      options: {
        name: 'ea-media-tools',
        productName: 'EA Media Tools',
        bin: 'ea-media-tools',
        categories: ['AudioVideo', 'Video'],
        maintainer: 'eaforlife <ea.0691@gmail.com>',
        homepage: 'https://github.com/eaforlife/media-converter',
      },
    }),
  ],
  plugins: [
    new VitePlugin({
      // `build` can specify multiple entry builds, which can be Main process, Preload scripts, Worker process, etc.
      // If you are familiar with Vite configuration, it will look really familiar.
      build: [
        {
          // `entry` is just an alias for `build.lib.entry` in the corresponding file of `config`.
          entry: 'src/main.ts',
          config: 'vite.main.config.mts',
          target: 'main',
        },
        {
          entry: 'src/preload.ts',
          config: 'vite.preload.config.mts',
          target: 'preload',
        },
      ],
      renderer: [
        {
          name: 'main_window',
          config: 'vite.renderer.config.mts',
        },
      ],
    }),
    // Fuses are used to enable/disable various Electron functionality
    // at package time, before code signing the application
    new FusesPlugin({
      version: FuseVersion.V1,
      [FuseV1Options.RunAsNode]: false,
      [FuseV1Options.EnableCookieEncryption]: true,
      [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false,
      [FuseV1Options.EnableNodeCliInspectArguments]: false,
      [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true,
      [FuseV1Options.OnlyLoadAppFromAsar]: true,
    }),
  ],
};

export default config;
