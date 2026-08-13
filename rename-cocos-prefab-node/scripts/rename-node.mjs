#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { access, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node rename-node.mjs --project <dir> --prefab <path> --node <node/path> --name <new-name> [--allow-duplicate] [--dry-run]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { allowDuplicate: false, dryRun: false };
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === '--allow-duplicate') options.allowDuplicate = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--prefab', '--node', '--name'].includes(arg)) {
      const value = argv[++position];
      if (!value || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  for (const key of ['project', 'prefab', 'node', 'name']) if (!options[key]) usage(`--${key} is required`);
  if (!options.name.trim() || options.name.includes('/') || options.name.includes('\\')) usage('--name must be a non-empty node name without path separators');
  return options;
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
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
      if (!(await exists(entry.path))) throw new Error(`transaction target disappeared: ${entry.path}`);
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

function childNodeIds(objects, node) {
  if (!Array.isArray(node._children)) throw new Error(`node ${node._name} has invalid _children data`);
  return node._children.map((entry) => {
    const id = entry?.__id__;
    if (!Number.isInteger(id) || objects[id]?.__type__ !== 'cc.Node') throw new Error(`node ${node._name} contains an invalid child reference`);
    return id;
  });
}

function findNode(objects, rootId, nodePath) {
  let currentId = rootId;
  const parts = nodePath.replaceAll('\\', '/').split('/').filter(Boolean);
  if (parts[0] === objects[rootId]._name) parts.shift();
  for (const part of parts) {
    const matches = childNodeIds(objects, objects[currentId]).filter((id) => objects[id]._name === part);
    if (matches.length === 0) throw new Error(`node path not found at: ${part}`);
    if (matches.length > 1) throw new Error(`node path is ambiguous at: ${part}`);
    currentId = matches[0];
  }
  return currentId;
}

const options = parseArgs(process.argv.slice(2));
const projectDir = resolve(options.project);
let projectPackage;
try { projectPackage = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf8')); }
catch { usage(`cannot read a valid package.json in ${projectDir}`); }
const creatorVersion = String(projectPackage?.creator?.version ?? '');
if (!/^3\.8(?:\.|$)/.test(creatorVersion)) usage(`expected Cocos Creator 3.8, found ${creatorVersion || 'no creator version'}`);

const assetsDir = resolve(projectDir, 'assets');
let prefabAssetPath = options.prefab.replaceAll('\\', '/');
if (prefabAssetPath.startsWith('assets/')) prefabAssetPath = prefabAssetPath.slice('assets/'.length);
if (extname(prefabAssetPath).toLowerCase() !== '.prefab') prefabAssetPath += '.prefab';
const prefabPath = resolve(assetsDir, prefabAssetPath);
if (!isWithin(assetsDir, prefabPath) || prefabPath === assetsDir) usage('--prefab must resolve inside assets');

let objects;
try { objects = JSON.parse(await readFile(prefabPath, 'utf8')); }
catch { usage(`cannot read a valid Prefab: ${prefabPath}`); }
if (!Array.isArray(objects) || objects[0]?.__type__ !== 'cc.Prefab') usage('unsupported Prefab object table');
const rootId = objects[0]?.data?.__id__;
if (!Number.isInteger(rootId) || objects[rootId]?.__type__ !== 'cc.Node') usage('Prefab has an invalid root node reference');

try {
  const nodeId = findNode(objects, rootId, options.node);
  const node = objects[nodeId];
  const oldName = node._name;
  const isRoot = nodeId === rootId;
  let meta = null;
  if (!isRoot) {
    const parentId = node?._parent?.__id__;
    if (!Number.isInteger(parentId) || objects[parentId]?.__type__ !== 'cc.Node') throw new Error(`node ${oldName} has an invalid parent reference`);
    const siblings = childNodeIds(objects, objects[parentId]).filter((id) => id !== nodeId);
    if (!options.allowDuplicate && siblings.some((id) => objects[id]._name === options.name)) throw new Error(`parent ${objects[parentId]._name} already has a direct child named ${options.name}`);
  } else {
    try { meta = JSON.parse(await readFile(`${prefabPath}.meta`, 'utf8')); }
    catch { throw new Error(`cannot read a valid Prefab meta file: ${prefabPath}.meta`); }
  }

  node._name = options.name;
  if (isRoot) {
    objects[0]._name = options.name;
    meta.userData ??= {};
    meta.userData.syncNodeName = options.name;
  }
  if (!options.dryRun) {
    const entries = [{ path: prefabPath, contents: `${JSON.stringify(objects, null, 2)}\n` }];
    if (isRoot) entries.push({ path: `${prefabPath}.meta`, contents: `${JSON.stringify(meta, null, 2)}\n` });
    await replaceFilesTransaction(entries);
  }
  console.log(`${options.dryRun ? 'Validated rename of' : 'Renamed'} ${oldName} -> ${options.name}${isRoot ? ' (root)' : ''}`);
} catch (error) { usage(error.message); }
