#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node add-node.mjs --project <dir> --prefab <assets-relative-path> --name <node-name> [--parent <node/path>] [--position <x,y>] [--size <width,height>] [--anchor <x,y>] [--allow-duplicate]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { allowDuplicate: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-duplicate') options.allowDuplicate = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--prefab', '--name', '--parent', '--position', '--size', '--anchor'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  for (const key of ['project', 'prefab', 'name']) {
    if (!options[key]) usage(`--${key} is required`);
  }
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

function childNodeIds(objects, node) {
  if (!Array.isArray(node._children)) throw new Error(`node ${node._name} has invalid _children data`);
  return node._children.map((entry) => {
    const id = entry?.__id__;
    if (!Number.isInteger(id) || objects[id]?.__type__ !== 'cc.Node') {
      throw new Error(`node ${node._name} contains an invalid child reference`);
    }
    return id;
  });
}

function findParent(objects, rootId, parentPath) {
  let currentId = rootId;
  if (!parentPath) return currentId;
  const parts = parentPath.replaceAll('\\', '/').split('/').filter(Boolean);
  if (parts[0] === objects[rootId]._name) parts.shift();
  for (const part of parts) {
    const matches = childNodeIds(objects, objects[currentId]).filter((id) => objects[id]._name === part);
    if (matches.length === 0) throw new Error(`parent path not found at: ${part}`);
    if (matches.length > 1) throw new Error(`parent path is ambiguous at: ${part}`);
    currentId = matches[0];
  }
  return currentId;
}

const options = parseArgs(process.argv.slice(2));
const [positionX, positionY] = numberPair(options.position, '--position', [0, 0]);
const [width, height] = numberPair(options.size, '--size', [100, 100]);
const [anchorX, anchorY] = numberPair(options.anchor, '--anchor', [0.5, 0.5]);
if (!options.name.trim() || options.name.includes('/') || options.name.includes('\\')) {
  usage('--name must be a non-empty node name without path separators');
}

const projectDir = resolve(options.project);
let projectPackage;
try {
  projectPackage = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf8'));
} catch {
  usage(`cannot read a valid package.json in ${projectDir}`);
}
const creatorVersion = String(projectPackage?.creator?.version ?? '');
if (!/^3\.8(?:\.|$)/.test(creatorVersion)) usage(`expected Cocos Creator 3.8, found ${creatorVersion || 'no creator version'}`);

const assetsDir = resolve(projectDir, 'assets');
let assetPath = options.prefab.replaceAll('\\', '/');
if (assetPath.startsWith('assets/')) assetPath = assetPath.slice('assets/'.length);
if (extname(assetPath).toLowerCase() !== '.prefab') assetPath += '.prefab';
const prefabPath = resolve(assetsDir, assetPath);
if (!isWithin(assetsDir, prefabPath) || prefabPath === assetsDir) usage('--prefab must resolve inside the project assets directory');

let objects;
try {
  objects = JSON.parse(await readFile(prefabPath, 'utf8'));
} catch {
  usage(`cannot read a valid Prefab: ${prefabPath}`);
}
if (!Array.isArray(objects) || objects[0]?.__type__ !== 'cc.Prefab') usage('unsupported Prefab object table');
const rootId = objects[0]?.data?.__id__;
if (!Number.isInteger(rootId) || objects[rootId]?.__type__ !== 'cc.Node') usage('Prefab has an invalid root node reference');

let parentId;
try {
  parentId = findParent(objects, rootId, options.parent);
} catch (error) {
  usage(error.message);
}
const parent = objects[parentId];
const existingChildren = childNodeIds(objects, parent);
if (!options.allowDuplicate && existingChildren.some((id) => objects[id]._name === options.name)) {
  usage(`parent ${parent._name} already has a direct child named ${options.name}`);
}

const nodeId = objects.length;
const transformId = nodeId + 1;
const componentPrefabInfoId = nodeId + 2;
const nodePrefabInfoId = nodeId + 3;
objects.push(
  {
    __type__: 'cc.Node', _name: options.name, _objFlags: 0, __editorExtras__: {}, _parent: { __id__: parentId }, _children: [],
    _active: true, _components: [{ __id__: transformId }], _prefab: { __id__: nodePrefabInfoId },
    _lpos: { __type__: 'cc.Vec3', x: positionX, y: positionY, z: 0 }, _lrot: { __type__: 'cc.Quat', x: 0, y: 0, z: 0, w: 1 },
    _lscale: { __type__: 'cc.Vec3', x: 1, y: 1, z: 1 }, _mobility: 0, _layer: 33554432,
    _euler: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 }, _id: ''
  },
  {
    __type__: 'cc.UITransform', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true,
    __prefab: { __id__: componentPrefabInfoId }, _contentSize: { __type__: 'cc.Size', width, height },
    _anchorPoint: { __type__: 'cc.Vec2', x: anchorX, y: anchorY }, _id: ''
  },
  { __type__: 'cc.CompPrefabInfo', fileId: fileId() },
  {
    __type__: 'cc.PrefabInfo', root: { __id__: rootId }, asset: { __id__: 0 }, fileId: fileId(), instance: null,
    targetOverrides: null, nestedPrefabInstanceRoots: null
  }
);
parent._children.push({ __id__: nodeId });

await writeFile(prefabPath, `${JSON.stringify(objects, null, 2)}\n`, 'utf8');
console.log(prefabPath);
console.log(`Added ${options.name} under ${parent._name}`);
