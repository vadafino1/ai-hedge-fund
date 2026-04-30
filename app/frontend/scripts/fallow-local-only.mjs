#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const args = process.argv.slice(2);

const nonFlagArgs = args.filter((arg) => !arg.startsWith('-'));
const firstCommand = nonFlagArgs[0] ?? '';
const commandPair = nonFlagArgs.slice(0, 2).join(' ');
const hasFlag = (name) => args.some((arg) => arg === name || arg.startsWith(`${name}=`));

const blockedReasons = [];

if (firstCommand === 'license') {
  blockedReasons.push('`fallow license ...` is disabled: this repo uses the free local/static Fallow layer only.');
}

if (commandPair === 'coverage setup') {
  blockedReasons.push('`fallow coverage setup` is disabled: it prepares the paid runtime sidecar flow.');
}

if (commandPair === 'coverage upload-inventory') {
  blockedReasons.push('`fallow coverage upload-inventory` is disabled: it uploads inventory to Fallow Cloud.');
}

if (hasFlag('--runtime-coverage')) {
  blockedReasons.push('`--runtime-coverage` is disabled: runtime intelligence requires the paid/cloud layer. Use local `--coverage` with an Istanbul coverage file if needed.');
}

if (blockedReasons.length > 0) {
  console.error('Fallow local-only policy blocked this command.');
  for (const reason of blockedReasons) {
    console.error(`- ${reason}`);
  }
  console.error('Allowed examples: npm run fallow:json, npm run fallow:audit, npm run fallow:fix:dry');
  process.exit(2);
}

const fallowBin = process.platform === 'win32'
  ? path.join(projectRoot, 'node_modules', '.bin', 'fallow.cmd')
  : path.join(projectRoot, 'node_modules', '.bin', 'fallow');

if (!existsSync(fallowBin)) {
  console.error('Local Fallow binary not found. Run `npm install` in app/frontend first.');
  process.exit(127);
}

const env = { ...process.env };
// Prevent repo scripts from accidentally authenticating against Fallow Cloud.
delete env.FALLOW_API_KEY;
delete env.FALLOW_TOKEN;
delete env.FALLOW_LICENSE;
delete env.FALLOW_LICENSE_KEY;
delete env.FALLOW_CLOUD_URL;

const child = spawn(fallowBin, args, {
  cwd: projectRoot,
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error(`Failed to start local Fallow: ${error.message}`);
  process.exit(127);
});
