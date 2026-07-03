#!/usr/bin/env node

import { randomBytes, randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';

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
const meta = {
  ver: '1.1.50', importer: 'prefab', imported: true, uuid: randomUUID(), files: ['.json'], subMetas: {},
  userData: { syncNodeName: name }
};

if (!options.force) {
  for (const outputPath of [prefabPath, `${prefabPath}.meta`]) {
    try {
      await access(outputPath);
      usage(`asset already exists: ${outputPath} (use --force to replace it)`);
    } catch (error) {
      if (error.code !== 'ENOENT') throw error;
    }
  }
}

await mkdir(dirname(prefabPath), { recursive: true });
const writeOptions = options.force ? { encoding: 'utf8' } : { encoding: 'utf8', flag: 'wx' };
try {
  await writeFile(prefabPath, `${JSON.stringify(prefab, null, 2)}\n`, writeOptions);
  await writeFile(`${prefabPath}.meta`, `${JSON.stringify(meta, null, 2)}\n`, writeOptions);
} catch (error) {
  if (error.code === 'EEXIST') usage(`asset already exists: ${prefabPath} (use --force to replace it)`);
  throw error;
}

console.log(prefabPath);
console.log(`${prefabPath}.meta`);
