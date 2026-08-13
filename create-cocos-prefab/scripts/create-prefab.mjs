#!/usr/bin/env node

import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node create-prefab.mjs --project <dir> --path <assets-relative-path> [--size <width,height>] [--force]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { force: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--force') options.force = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (arg === '--project' || arg === '--path' || arg === '--size') {
      const value = argv[++index];
      if (!value || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  if (!options.project) usage('--project is required');
  if (!options.path) usage('--path is required');
  return options;
}

function numberPair(value, label, defaults) {
  if (!value) return defaults;
  const numbers = value.split(',').map(Number);
  if (numbers.length !== 2 || numbers.some((number) => !Number.isFinite(number))) usage(`${label} must contain two comma-separated numbers`);
  return numbers;
}

function fileId() {
  return randomBytes(16).toString('base64').replace(/=/g, '').slice(0, 22);
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function directoryMeta() {
  return { ver: '1.2.0', importer: 'directory', imported: true, uuid: randomUUID(), files: [], subMetas: {}, userData: {} };
}

async function writeNewFileAtomically(path, contents) {
  const temporary = `${path}.__codex_tmp_${randomUUID()}`;
  try {
    await writeFile(temporary, contents, { encoding: 'utf8', flag: 'wx' });
    await rename(temporary, path);
  } catch (error) {
    await rm(temporary, { force: true }).catch(() => {});
    throw error;
  }
}

async function ensureDirectoryChain(assetsDir, directory) {
  const relativeDirectory = relative(assetsDir, directory);
  let current = assetsDir;
  for (const part of relativeDirectory.split(sep).filter(Boolean)) {
    current = join(current, part);
    await mkdir(current, { recursive: true });
    const metaPath = `${current}.meta`;
    if (!(await exists(metaPath))) {
      try {
        await writeNewFileAtomically(metaPath, `${JSON.stringify(directoryMeta(), null, 2)}\n`);
      } catch (error) {
        if (error.code !== 'EEXIST') throw error;
      }
    }
  }
}

async function replaceFilesTransaction(entries) {
  const transaction = randomUUID();
  const prepared = [];
  const backups = [];
  const installed = [];
  try {
    for (const entry of entries) {
      const temporary = `${entry.path}.__codex_tmp_${transaction}`;
      prepared.push({ ...entry, temporary });
      await writeFile(temporary, entry.contents, { encoding: 'utf8', flag: 'wx' });
    }
    for (const entry of prepared) {
      if (!(await exists(entry.path))) continue;
      if (!entry.replace) {
        const error = new Error(`asset already exists: ${entry.path} (use --force to replace it)`);
        error.code = 'EEXIST';
        throw error;
      }
      const backup = `${entry.path}.__codex_backup_${transaction}`;
      await rename(entry.path, backup);
      backups.push({ path: entry.path, backup });
    }
    for (const entry of prepared) {
      await rename(entry.temporary, entry.path);
      installed.push(entry.path);
    }
  } catch (error) {
    const rollbackErrors = [];
    for (const path of installed.reverse()) {
      try { await rm(path, { force: true }); } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
    }
    for (const entry of backups.reverse()) {
      try { await rename(entry.backup, entry.path); } catch (rollbackError) { rollbackErrors.push(rollbackError.message); }
    }
    for (const entry of prepared) await rm(entry.temporary, { force: true }).catch(() => {});
    if (rollbackErrors.length) {
      throw new Error(`${error.message}; rollback failed: ${rollbackErrors.join('; ')}`);
    }
    throw error;
  }
  await Promise.all(backups.map((entry) => rm(entry.backup, { force: true })));
}

const options = parseArgs(process.argv.slice(2));
const [width, height] = numberPair(options.size, '--size', [100, 100]);
const projectDir = resolve(options.project);
let projectPackage;
try {
  projectPackage = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf8'));
} catch {
  usage(`cannot read a valid package.json in ${projectDir}`);
}

const creatorVersion = String(projectPackage?.creator?.version ?? '');
if (!/^3\.8(?:\.|$)/.test(creatorVersion)) {
  usage(`expected Cocos Creator 3.8, found ${creatorVersion || 'no creator version'}`);
}

const assetsDir = resolve(projectDir, 'assets');
let assetsStat;
try { assetsStat = await stat(assetsDir); } catch { usage(`assets directory not found: ${assetsDir}`); }
if (!assetsStat.isDirectory()) usage(`assets path is not a directory: ${assetsDir}`);
let assetPath = options.path.replaceAll('\\', '/');
if (assetPath.startsWith('assets/')) assetPath = assetPath.slice('assets/'.length);
if (extname(assetPath).toLowerCase() !== '.prefab') assetPath += '.prefab';
const prefabPath = resolve(assetsDir, assetPath);
if (!isWithin(assetsDir, prefabPath) || prefabPath === assetsDir) {
  usage('--path must resolve inside the project assets directory');
}

const name = basename(prefabPath, '.prefab');
if (!name.trim()) usage('Prefab name cannot be empty');

const prefab = [
  { __type__: 'cc.Prefab', _name: name, _objFlags: 0, __editorExtras__: {}, _native: '', data: { __id__: 1 }, optimizationPolicy: 0, persistent: false },
  {
    __type__: 'cc.Node', _name: name, _objFlags: 0, __editorExtras__: {}, _parent: null, _children: [], _active: true,
    _components: [{ __id__: 2 }], _prefab: { __id__: 4 },
    _lpos: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
    _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 },
    _mobility: 0, _layer: 33554432,
    _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _id: ''
  },
  {
    __type__: 'cc.UITransform', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: 1 }, _enabled: true,
    __prefab: { __id__: 3 }, _contentSize: { __type__: 'cc.Size', width, height },
    _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 }, _id: ''
  },
  { __type__: 'cc.CompPrefabInfo', fileId: fileId() },
  { __type__: 'cc.PrefabInfo', root: { __id__: 1 }, asset: { __id__: 0 }, fileId: fileId(), instance: null, targetOverrides: null }
];
const metaPath = `${prefabPath}.meta`;
const prefabExists = await exists(prefabPath);
const metaExists = await exists(metaPath);
if (!options.force && (prefabExists || metaExists)) {
  usage(`asset already exists: ${prefabExists ? prefabPath : metaPath} (use --force to replace it)`);
}
if (options.force && prefabExists !== metaExists) {
  usage(`cannot replace an incomplete asset pair; expected both ${prefabPath} and ${metaPath}`);
}

let meta;
if (prefabExists) {
  try { meta = JSON.parse(await readFile(metaPath, 'utf8')); }
  catch { usage(`cannot preserve UUID from a valid Prefab meta file: ${metaPath}`); }
  if (typeof meta.uuid !== 'string' || !meta.uuid) usage(`Prefab meta has no UUID to preserve: ${metaPath}`);
  if (meta.importer !== 'prefab') usage(`expected prefab importer in ${metaPath}`);
  meta.userData ??= {};
  meta.userData.syncNodeName = name;
} else {
  meta = {
    ver: '1.1.50', importer: 'prefab', imported: true, uuid: randomUUID(), files: ['.json'], subMetas: {},
    userData: { syncNodeName: name }
  };
}

try {
  await ensureDirectoryChain(assetsDir, dirname(prefabPath));
  await replaceFilesTransaction([
    { path: prefabPath, contents: `${JSON.stringify(prefab, null, 2)}\n`, replace: options.force },
    { path: metaPath, contents: `${JSON.stringify(meta, null, 2)}\n`, replace: options.force }
  ]);
} catch (error) {
  if (error.code === 'EEXIST') {
    usage(error.message);
  }
  throw error;
}

console.log(prefabPath);
console.log(metaPath);
