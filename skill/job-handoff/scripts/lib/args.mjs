import path from 'node:path';
import { fail } from './util.mjs';

// spec: { name: 'string' | 'bool' }
export function parseArgs(argv, spec, usage) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '-h' || arg === '--help') { console.log(usage); process.exit(0); }
    if (!arg.startsWith('--')) fail(`unexpected argument: ${arg}\n${usage}`);
    const name = arg.slice(2);
    const kind = spec[name];
    if (!kind) fail(`unknown option: ${arg}\n${usage}`);
    if (kind === 'bool') { out[name] = true; continue; }
    const value = argv[++i];
    if (value === undefined || value.startsWith('--')) fail(`missing value for ${arg}`);
    out[name] = value;
  }
  return out;
}

export function requireAbs(options, name) {
  const value = options[name];
  if (!value) fail(`--${name} is required`);
  if (!path.isAbsolute(value)) fail(`--${name} must be an absolute path`);
  return path.resolve(value);
}
