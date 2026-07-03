#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node remove-node.mjs --project <dir> --prefab <path> --node <node/path> [--dry-run]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { dryRun: false };
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--prefab', '--node'].includes(arg)) {
      const value = argv[++position];
      if (!value || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  for (const key of ['project', 'prefab', 'node']) if (!options[key]) usage(`--${key} is required`);
  return options;
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
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

function directReferences(value, results) {
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__)) results.add(value.__id__);
  for (const child of Object.values(value)) directReferences(child, results);
}

function reachableObjects(objects, startId) {
  const reached = new Set();
  const queue = [startId];
  while (queue.length) {
    const id = queue.pop();
    if (reached.has(id)) continue;
    if (!Number.isInteger(id) || id < 0 || id >= objects.length) throw new Error(`invalid object reference: ${id}`);
    reached.add(id);
    const references = new Set();
    directReferences(objects[id], references);
    for (const reference of references) if (!reached.has(reference)) queue.push(reference);
  }
  return reached;
}

function subtreeNodeIds(objects, nodeId, results = new Set()) {
  if (results.has(nodeId)) throw new Error(`node hierarchy cycle detected at object ${nodeId}`);
  results.add(nodeId);
  for (const childId of childNodeIds(objects, objects[nodeId])) subtreeNodeIds(objects, childId, results);
  return results;
}

function ownedObjectIds(objects, nodeIds) {
  const owned = new Set(nodeIds);
  for (const nodeId of nodeIds) {
    const node = objects[nodeId];
    const nodePrefabInfoId = node?._prefab?.__id__;
    if (Number.isInteger(nodePrefabInfoId)) owned.add(nodePrefabInfoId);
    if (!Array.isArray(node._components)) throw new Error(`node ${node._name} has invalid _components data`);
    for (const entry of node._components) {
      const componentId = entry?.__id__;
      if (!Number.isInteger(componentId)) throw new Error(`node ${node._name} contains an invalid component reference`);
      owned.add(componentId);
      const componentPrefabInfoId = objects[componentId]?.__prefab?.__id__;
      if (Number.isInteger(componentPrefabInfoId)) owned.add(componentPrefabInfoId);
    }
  }
  return owned;
}

function remapReferences(value, idMap) {
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__)) {
    if (!idMap.has(value.__id__)) throw new Error(`remaining object references removed object ${value.__id__}`);
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
  if (nodeId === rootId) throw new Error('Prefab root node cannot be removed');
  const node = objects[nodeId];
  const parentId = node?._parent?.__id__;
  if (!Number.isInteger(parentId) || objects[parentId]?.__type__ !== 'cc.Node') throw new Error(`node ${node._name} has an invalid parent reference`);
  const parent = objects[parentId];
  const occurrences = parent._children.filter((entry) => entry?.__id__ === nodeId).length;
  if (occurrences !== 1) throw new Error(`parent ${parent._name} must reference ${node._name} exactly once`);

  const beforeReachable = reachableObjects(objects, 0);
  const nodeIds = subtreeNodeIds(objects, nodeId);
  const ownedIds = ownedObjectIds(objects, nodeIds);
  parent._children = parent._children.filter((entry) => entry?.__id__ !== nodeId);
  const afterReachable = reachableObjects(objects, 0);
  const externallyReferenced = [...ownedIds].filter((id) => afterReachable.has(id));
  if (externallyReferenced.length) throw new Error(`node subtree is still referenced elsewhere: ${externallyReferenced.slice(0, 8).join(', ')}`);

  const removedIds = new Set([...beforeReachable].filter((id) => !afterReachable.has(id)));
  if (![...nodeIds].every((id) => removedIds.has(id))) throw new Error('not every subtree node became unreachable');
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
  console.log(`${options.dryRun ? 'Validated removal of' : 'Removed'} ${node._name} subtree (${nodeIds.size} node(s))`);
  console.log(`Object table: ${objects.length} -> ${compacted.length}`);
} catch (error) { usage(error.message); }
