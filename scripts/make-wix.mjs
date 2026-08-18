import { spawnSync } from 'node:child_process';

const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['electron-forge', 'make', '--platform=win32'], {
  stdio: 'inherit',
  env: { ...process.env, EA_BUILD_WIX: '1' },
});

process.exit(result.status ?? 1);
