#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const RESERVED = new Set(['__type__', '_name', '_objFlags', '__editorExtras__', 'node', '__prefab', '_id']);

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node set-properties.mjs --project <dir> --prefab <path> --node <node/path> (--component <type> | --script <path>) (--values <json> | --values-file <path>) [--index <n>] [--allow-new] [--dry-run]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { allowNew: false, dryRun: false, index: 0 };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-new') options.allowNew = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--prefab', '--node', '--component', '--script', '--values', '--values-file', '--index'].includes(arg)) {
      const value = argv[++index];
      if (value === undefined || value.startsWith('--')) usage(`${arg} requires a value`);
      const key = arg.slice(2).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
      options[key] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  for (const key of ['project', 'prefab', 'node']) if (!options[key]) usage(`--${key} is required`);
  if (Boolean(options.component) === Boolean(options.script)) usage('specify exactly one of --component or --script');
  if (Boolean(options.values) === Boolean(options.valuesFile)) usage('specify exactly one of --values or --values-file');
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

function builtInType(type) {
  return type.startsWith('cc.') ? type : `cc.${type}`;
}

function findComponentId(objects, nodeId, type, index = 0) {
  const node = objects[nodeId];
  if (!Array.isArray(node._components)) throw new Error(`node ${node._name} has invalid _components data`);
  const matches = node._components.map((entry) => entry?.__id__).filter((id) => objects[id]?.__type__ === type);
  if (matches.length === 0) throw new Error(`component ${type} not found on ${node._name}`);
  if (index >= matches.length) throw new Error(`component index ${index} is out of range; found ${matches.length} ${type} component(s)`);
  return matches[index];
}

async function assetReference(assetsDir, descriptor) {
  if (!descriptor || typeof descriptor.path !== 'string' || typeof descriptor.type !== 'string') throw new Error('$asset requires path and type');
  let assetPath = descriptor.path.replaceAll('\\', '/');
  if (assetPath.startsWith('assets/')) assetPath = assetPath.slice('assets/'.length);
  const filePath = resolve(assetsDir, assetPath);
  if (!isWithin(assetsDir, filePath) || filePath === assetsDir) throw new Error('$asset path must resolve inside assets');
  const meta = JSON.parse(await readFile(`${filePath}.meta`, 'utf8'));
  let uuid = meta.uuid;
  if (descriptor.subMeta) {
    uuid = meta.subMetas?.[descriptor.subMeta]?.uuid;
    if (!uuid) throw new Error(`subMeta ${descriptor.subMeta} not found for ${descriptor.path}`);
  } else if (descriptor.type === 'cc.Texture2D') {
    uuid = Object.values(meta.subMetas ?? {}).find((entry) => entry.importer === 'texture')?.uuid ?? meta.userData?.redirect ?? uuid;
  } else if (descriptor.type === 'cc.SpriteFrame') {
    uuid = Object.values(meta.subMetas ?? {}).find((entry) => entry.importer === 'sprite-frame')?.uuid;
    if (!uuid) throw new Error(`no SpriteFrame subasset found for ${descriptor.path}; pass $uuid or subMeta explicitly`);
  }
  return { __uuid__: uuid, __expectedType__: descriptor.type };
}

async function transformValue(value, context) {
  if (Array.isArray(value)) return Promise.all(value.map((entry) => transformValue(entry, context)));
  if (!value || typeof value !== 'object') return value;
  if ('$node' in value) return { __id__: findNode(context.objects, context.rootId, value.$node) };
  if ('$uuid' in value) {
    const descriptor = value.$uuid;
    if (!descriptor?.uuid || !descriptor?.type) throw new Error('$uuid requires uuid and type');
    return { __uuid__: descriptor.uuid, __expectedType__: descriptor.type };
  }
  if ('$asset' in value) return assetReference(context.assetsDir, value.$asset);
  if ('$component' in value) {
    const descriptor = value.$component;
    if (!descriptor?.node || Boolean(descriptor.type) === Boolean(descriptor.script)) throw new Error('$component requires node and exactly one of type or script');
    const nodeId = findNode(context.objects, context.rootId, descriptor.node);
    const type = descriptor.type ? builtInType(descriptor.type) : await scriptType(context.assetsDir, descriptor.script);
    return { __id__: findComponentId(context.objects, nodeId, type, descriptor.index ?? 0) };
  }
  if ('$type' in value) {
    const type = value.$type.startsWith('cc.') ? value.$type : `cc.${value.$type}`;
    const result = { __type__: type };
    for (const [key, entry] of Object.entries(value)) if (key !== '$type') result[key] = await transformValue(entry, context);
    return result;
  }
  const result = {};
  for (const [key, entry] of Object.entries(value)) result[key] = await transformValue(entry, context);
  return result;
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

let values;
try {
  const json = options.values ?? await readFile(resolve(options.valuesFile), 'utf8');
  values = JSON.parse(json);
} catch (error) { usage(`cannot parse property values: ${error.message}`); }
if (!values || Array.isArray(values) || typeof values !== 'object') usage('property values must be a JSON object');

try {
  const nodeId = findNode(objects, rootId, options.node);
  const type = options.component ? builtInType(options.component) : await scriptType(assetsDir, options.script);
  const componentId = findComponentId(objects, nodeId, type, options.index);
  const component = objects[componentId];
  const transformed = await transformValue(values, { objects, rootId, assetsDir });
  for (const [key, value] of Object.entries(transformed)) {
    if (RESERVED.has(key)) throw new Error(`cannot assign reserved property: ${key}`);
    if (!options.allowNew && !(key in component)) throw new Error(`property does not exist on serialized ${type}: ${key}`);
    component[key] = value;
  }
  if (!options.dryRun) await writeFile(prefabPath, `${JSON.stringify(objects, null, 2)}\n`, 'utf8');
  console.log(`${options.dryRun ? 'Validated' : 'Updated'} ${type} on ${objects[nodeId]._name}: ${Object.keys(transformed).join(', ')}`);
} catch (error) { usage(error.message); }
