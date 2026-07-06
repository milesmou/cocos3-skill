#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { access, readFile, rename, stat } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node rename-asset.mjs --project <dir> --asset <assets-relative-path> --name <new-name> [--dry-run]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--asset', '--name'].includes(arg)) {
      const value = argv[++position];
      if (!value || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  for (const key of ['project', 'asset', 'name']) if (!options[key]) usage(`--${key} is required`);
  if (!options.name.trim() || options.name.includes('/') || options.name.includes('\\')) usage('--name must not be empty or contain path separators');
  return options;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

const options = parseArgs(process.argv.slice(2));
const projectDir = resolve(options.project);
let projectPackage;
try { projectPackage = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf8')); }
catch { usage(`cannot read a valid package.json in ${projectDir}`); }
const creatorVersion = String(projectPackage?.creator?.version ?? '');
if (!/^3\.8(?:\.|$)/.test(creatorVersion)) usage(`expected Cocos Creator 3.8, found ${creatorVersion || 'no creator version'}`);

const assetsDir = resolve(projectDir, 'assets');
let normalized = options.asset.replaceAll('\\', '/');
if (normalized.startsWith('assets/')) normalized = normalized.slice('assets/'.length);
const source = resolve(assetsDir, normalized);
if (!isWithin(assetsDir, source) || source === assetsDir) usage('--asset must resolve inside assets');

try {
  const sourceStat = await stat(source);
  if (!(await exists(`${source}.meta`))) throw new Error(`source meta file not found: ${source}.meta`);
  if (sourceStat.isFile() && extname(source).toLowerCase() !== extname(options.name).toLowerCase()) throw new Error('file extension must remain unchanged');
  const destination = join(dirname(source), options.name);
  if (source === destination) throw new Error('new name is identical to the current name');
  const caseOnly = source.toLowerCase() === destination.toLowerCase();
  if (!caseOnly && await exists(destination)) throw new Error(`destination already exists: ${destination}`);
  if (!caseOnly && await exists(`${destination}.meta`)) throw new Error(`destination meta already exists: ${destination}.meta`);

  if (!options.dryRun) {
    const temporary = caseOnly ? join(dirname(source), `.__codex_rename_${randomUUID()}`) : destination;
    await rename(source, temporary);
    try { await rename(`${source}.meta`, `${temporary}.meta`); }
    catch (error) {
      try { await rename(temporary, source); } catch {}
      throw error;
    }
    if (caseOnly) {
      try {
        await rename(temporary, destination);
        await rename(`${temporary}.meta`, `${destination}.meta`);
      } catch (error) {
        try { if (await exists(destination)) await rename(destination, source); } catch {}
        try { if (await exists(`${temporary}.meta`)) await rename(`${temporary}.meta`, `${source}.meta`); } catch {}
        throw error;
      }
    }
  }
  console.log(`${options.dryRun ? 'Validated rename of' : 'Renamed'} ${relative(assetsDir, source)} -> ${relative(assetsDir, destination)}`);
} catch (error) { usage(error.message); }
