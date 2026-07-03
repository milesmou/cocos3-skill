#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node remove-component.mjs --project <dir> --prefab <path> --node <node/path> (--component <type> | --script <path>) [--index <n> | --all] [--dry-run]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { all: false, dryRun: false, index: 0, indexProvided: false };
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === '--all') options.all = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--prefab', '--node', '--component', '--script', '--index'].includes(arg)) {
      const value = argv[++position];
      if (value === undefined || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
      if (arg === '--index') options.indexProvided = true;
    } else usage(`unknown argument: ${arg}`);
  }
  for (const key of ['project', 'prefab', 'node']) if (!options[key]) usage(`--${key} is required`);
  if (Boolean(options.component) === Boolean(options.script)) usage('specify exactly one of --component or --script');
  if (options.all && options.indexProvided) usage('--all and --index cannot be used together');
  options.index = Number(options.index);
  if (!Number.isInteger(options.index) || options.index < 0) usage('--index must be a non-negative integer');
  return options;
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function compressUuid(uuid) {
  const hex = uuid.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`invalid script UUID: ${uuid}`);
  let output = hex.slice(0, 5);
  for (let index = 5; index < hex.length; index += 3) {
    const value = Number.parseInt(hex.slice(index, index + 3), 16);
    output += BASE64[(value >> 6) & 63] + BASE64[value & 63];
  }
  return output;
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

async function scriptType(assetsDir, scriptAssetPath) {
  let normalized = scriptAssetPath.replaceAll('\\', '/');
  if (normalized.startsWith('assets/')) normalized = normalized.slice('assets/'.length);
  const scriptPath = resolve(assetsDir, normalized);
  if (!isWithin(assetsDir, scriptPath) || scriptPath === assetsDir) throw new Error('script path must resolve inside assets');
  const meta = JSON.parse(await readFile(`${scriptPath}.meta`, 'utf8'));
  return compressUuid(meta.uuid);
}

function collectRemovedReferences(value, removedIds, path, results) {
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__) && removedIds.has(value.__id__)) results.push(`${path} -> ${value.__id__}`);
  for (const [key, child] of Object.entries(value)) collectRemovedReferences(child, removedIds, `${path}.${key}`, results);
}

function remapReferences(value, idMap) {
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__)) {
    if (!idMap.has(value.__id__)) throw new Error(`cannot remap removed reference: ${value.__id__}`);
    value.__id__ = idMap.get(value.__id__);
  }
  for (const child of Object.values(value)) remapReferences(child, idMap);
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
  if (!Array.isArray(node._components)) throw new Error(`node ${node._name} has invalid _components data`);
  const requestedBuiltIn = options.component ? options.component.replace(/^cc\./i, '').toLowerCase() : null;
  const discoveredBuiltIn = requestedBuiltIn
    ? node._components.map((entry) => objects[entry?.__id__]?.__type__).find((type) => type?.startsWith('cc.') && type.slice(3).toLowerCase() === requestedBuiltIn)
    : null;
  const componentType = options.component ? (discoveredBuiltIn ?? `cc.${options.component.replace(/^cc\./i, '')}`) : await scriptType(assetsDir, options.script);
  if (componentType === 'cc.UITransform') throw new Error('cc.UITransform cannot be removed');
  const matches = node._components.map((entry) => entry?.__id__).filter((id) => objects[id]?.__type__ === componentType);
  if (matches.length === 0) throw new Error(`component ${componentType} not found on ${node._name}`);
  if (!options.all && options.index >= matches.length) throw new Error(`component index ${options.index} is out of range; found ${matches.length} component(s)`);
  const componentIds = options.all ? matches : [matches[options.index]];
  const removedIds = new Set(componentIds);
  for (const componentId of componentIds) {
    const prefabInfoId = objects[componentId]?.__prefab?.__id__;
    if (!Number.isInteger(prefabInfoId) || objects[prefabInfoId]?.__type__ !== 'cc.CompPrefabInfo') throw new Error(`component ${componentId} has invalid CompPrefabInfo linkage`);
    removedIds.add(prefabInfoId);
  }

  node._components = node._components.filter((entry) => !removedIds.has(entry?.__id__));
  const inbound = [];
  objects.forEach((object, id) => {
    if (!removedIds.has(id)) collectRemovedReferences(object, removedIds, `objects[${id}]`, inbound);
  });
  if (inbound.length) throw new Error(`component is still referenced elsewhere: ${inbound.slice(0, 5).join(', ')}`);

  const idMap = new Map();
  const compacted = [];
  objects.forEach((object, oldId) => {
    if (!removedIds.has(oldId)) {
      idMap.set(oldId, compacted.length);
      compacted.push(object);
    }
  });
  for (const object of compacted) remapReferences(object, idMap);
  if (!options.dryRun) await writeFile(prefabPath, `${JSON.stringify(compacted, null, 2)}\n`, 'utf8');
  console.log(`${options.dryRun ? 'Validated removal of' : 'Removed'} ${componentIds.length} ${componentType} component(s) from ${node._name}`);
  console.log(`Object table: ${objects.length} -> ${compacted.length}`);
} catch (error) { usage(error.message); }
