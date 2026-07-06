#!/usr/bin/env node

import { access, readFile, rename, stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, relative, resolve, sep } from 'node:path';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node move-asset.mjs --project <dir> --from <assets-relative-path> --to <assets-relative-path> [--dry-run]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--from', '--to'].includes(arg)) {
      const value = argv[++position];
      if (!value || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  for (const key of ['project', 'from', 'to']) if (!options[key]) usage(`--${key} is required`);
  return options;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function assetPath(assetsDir, value, label) {
  let normalized = value.replaceAll('\\', '/');
  if (normalized.startsWith('assets/')) normalized = normalized.slice('assets/'.length);
  const resolved = resolve(assetsDir, normalized);
  if (!isWithin(assetsDir, resolved) || resolved === assetsDir) usage(`${label} must resolve inside assets`);
  return resolved;
}

const options = parseArgs(process.argv.slice(2));
const projectDir = resolve(options.project);
let projectPackage;
try { projectPackage = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf8')); }
catch { usage(`cannot read a valid package.json in ${projectDir}`); }
const creatorVersion = String(projectPackage?.creator?.version ?? '');
if (!/^3\.8(?:\.|$)/.test(creatorVersion)) usage(`expected Cocos Creator 3.8, found ${creatorVersion || 'no creator version'}`);

const assetsDir = resolve(projectDir, 'assets');
const source = assetPath(assetsDir, options.from, '--from');
const destination = assetPath(assetsDir, options.to, '--to');
try {
  if (source.toLowerCase() === destination.toLowerCase()) throw new Error('source and destination are the same; use the rename skill for case changes');
  if (basename(source) !== basename(destination)) throw new Error('moving must preserve the resource name; use the rename skill to change names');
  const sourceStat = await stat(source);
  if (!(await exists(`${source}.meta`))) throw new Error(`source meta file not found: ${source}.meta`);
  if (sourceStat.isDirectory() && isWithin(source, destination)) throw new Error('cannot move a directory into itself');
  const destinationParent = dirname(destination);
  const parentStat = await stat(destinationParent);
  if (!parentStat.isDirectory()) throw new Error(`destination parent is not a directory: ${destinationParent}`);
  if (destinationParent !== assetsDir && !(await exists(`${destinationParent}.meta`))) throw new Error(`destination parent meta file not found: ${destinationParent}.meta`);
  if (await exists(destination)) throw new Error(`destination already exists: ${destination}`);
  if (await exists(`${destination}.meta`)) throw new Error(`destination meta already exists: ${destination}.meta`);

  if (!options.dryRun) {
    await rename(source, destination);
    try { await rename(`${source}.meta`, `${destination}.meta`); }
    catch (error) {
      try { await rename(destination, source); } catch {}
      throw error;
    }
  }
  console.log(`${options.dryRun ? 'Validated move of' : 'Moved'} ${relative(assetsDir, source)} -> ${relative(assetsDir, destination)}`);
} catch (error) { usage(error.message); }
