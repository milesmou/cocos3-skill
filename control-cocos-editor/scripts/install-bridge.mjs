#!/usr/bin/env node

import { cp, mkdir, readFile, rm, stat } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node install-bridge.mjs --project <dir> [--force] [--remove]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { force: false, remove: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') options.force = true;
    else if (arg === '--remove') options.remove = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (arg === '--project') options.project = argv[++index];
    else usage(`unknown argument: ${arg}`);
  }
  if (!options.project) usage('--project is required');
  return options;
}

function isWithin(parent, child) {
  const value = relative(parent, child);
  return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

const options = parseArgs(process.argv.slice(2));
const project = resolve(options.project);
const packagePath = resolve(project, 'package.json');
let projectPackage;
try { projectPackage = JSON.parse(await readFile(packagePath, 'utf8')); }
catch { usage(`cannot read project package.json: ${packagePath}`); }
const version = String(projectPackage?.creator?.version || '');
if (!/^3\.8(?:\.|$)/.test(version)) usage(`expected Cocos Creator 3.8.x, found ${version || '<missing>'}`);

const extensionsDir = resolve(project, 'extensions');
const target = resolve(extensionsDir, 'cocos3-codex-bridge');
if (!isWithin(project, target)) usage('resolved extension path escapes the project');

if (options.remove) {
  if (await exists(target)) await rm(target, { recursive: true, force: true });
  console.log(`Removed ${target}`);
  process.exit(0);
}

const source = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'assets', 'cocos3-codex-bridge');
if (await exists(target)) {
  if (!options.force) usage(`extension already exists: ${target}; pass --force to replace it`);
  await rm(target, { recursive: true, force: true });
}
await mkdir(extensionsDir, { recursive: true });
await cp(source, target, { recursive: true, errorOnExist: true });
console.log(`Installed ${target}`);
console.log('Enable or refresh cocos3-codex-bridge in Cocos Creator Extension Manager.');
