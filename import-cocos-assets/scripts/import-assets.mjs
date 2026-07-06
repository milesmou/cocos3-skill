#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { access, copyFile, mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';

const TYPE_INFO = new Map([
  ['.ts', { importer: 'typescript', ver: '4.0.24', files: [], userData: {} }],
  ['.js', { importer: 'javascript', ver: '4.0.24', files: ['.js'], userData: { loadPluginInEditor: false, loadPluginInWeb: true, loadPluginInNative: true, loadPluginInMiniGame: true, isPlugin: true } }],
  ['.json', { importer: 'json', ver: '2.0.1', files: ['.json'], userData: {} }],
  ['.txt', { importer: 'text', ver: '1.0.1', files: ['.json'], userData: {} }],
  ['.mp3', { importer: 'audio-clip', ver: '1.0.0', files: ['.json', '.mp3'], userData: { downloadMode: 0 } }],
  ['.effect', { importer: 'effect', ver: '1.7.1', files: ['.json'], userData: {} }],
  ['.mtl', { importer: 'material', ver: '1.0.21', files: ['.json'], userData: {} }],
  ['.atlas', { importer: '*', ver: '1.0.0', files: ['.atlas', '.json'], userData: {} }]
]);

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node import-assets.mjs --project <dir> --source <file-or-dir> --destination <assets-relative-dir> [--force] [--dry-run]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = { force: false, dryRun: false };
  for (let position = 0; position < argv.length; position += 1) {
    const arg = argv[position];
    if (arg === '--force') options.force = true;
    else if (arg === '--dry-run') options.dryRun = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--source', '--destination'].includes(arg)) {
      const value = argv[++position];
      if (!value || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  for (const key of ['project', 'source', 'destination']) if (!options[key]) usage(`--${key} is required`);
  return options;
}

async function exists(path) {
  try { await access(path); return true; } catch { return false; }
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

async function collectFiles(sourcePath) {
  const sourceStat = await stat(sourcePath);
  if (sourceStat.isFile()) return [{ source: sourcePath, relativePath: basename(sourcePath) }];
  if (!sourceStat.isDirectory()) throw new Error('source must be a file or directory');
  const results = [];
  async function walk(directory, prefix = '') {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const relativePath = join(prefix, entry.name);
      const fullPath = join(directory, entry.name);
      if (entry.isDirectory()) await walk(fullPath, relativePath);
      else if (entry.isFile() && !entry.name.endsWith('.meta')) results.push({ source: fullPath, relativePath });
    }
  }
  await walk(sourcePath);
  return results;
}

function pngInfo(buffer) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  if (buffer.length < 33 || !buffer.subarray(0, 8).equals(signature) || buffer.toString('ascii', 12, 16) !== 'IHDR') throw new Error('invalid PNG file');
  const width = buffer.readUInt32BE(16);
  const height = buffer.readUInt32BE(20);
  const colorType = buffer[25];
  let hasTransparencyChunk = false;
  for (let offset = 8; offset + 12 <= buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    if (type === 'tRNS') hasTransparencyChunk = true;
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  return { width, height, hasAlpha: colorType === 4 || colorType === 6 || hasTransparencyChunk };
}

function imageMeta(uuid, width, height, hasAlpha) {
  const textureUuid = `${uuid}@6c48a`;
  const spriteFrameUuid = `${uuid}@f9941`;
  return {
    ver: '1.0.27', importer: 'image', imported: true, uuid, files: ['.json', '.png'],
    subMetas: {
      '6c48a': {
        importer: 'texture', uuid: textureUuid, displayName: '', id: '6c48a', name: 'texture', ver: '1.0.22', imported: true, files: ['.json'], subMetas: {},
        userData: { wrapModeS: 'clamp-to-edge', wrapModeT: 'clamp-to-edge', imageUuidOrDatabaseUri: uuid, isUuid: true, visible: false, minfilter: 'linear', magfilter: 'linear', mipfilter: 'none', anisotropy: 0 }
      },
      'f9941': {
        importer: 'sprite-frame', uuid: spriteFrameUuid, displayName: '', id: 'f9941', name: 'spriteFrame', ver: '1.0.12', imported: true, files: ['.json'], subMetas: {},
        userData: {
          trimThreshold: 1, rotated: false, offsetX: 0, offsetY: 0, trimX: 0, trimY: 0, width, height, rawWidth: width, rawHeight: height,
          borderTop: 0, borderBottom: 0, borderLeft: 0, borderRight: 0, packable: true, pixelsToUnit: 100, pivotX: 0.5, pivotY: 0.5, meshType: 0,
          vertices: {
            rawPosition: [-width / 2, -height / 2, 0, width / 2, -height / 2, 0, -width / 2, height / 2, 0, width / 2, height / 2, 0],
            indexes: [0, 1, 2, 2, 1, 3], uv: [0, height, width, height, 0, 0, width, 0], nuv: [0, 0, 1, 0, 0, 1, 1, 1],
            minPos: [-width / 2, -height / 2, 0], maxPos: [width / 2, height / 2, 0]
          },
          isUuid: true, imageUuidOrDatabaseUri: textureUuid, atlasUuid: '', trimType: 'none'
        }
      }
    },
    userData: { type: 'sprite-frame', fixAlphaTransparencyArtifacts: false, hasAlpha, redirect: textureUuid }
  };
}

function basicMeta(uuid, info) {
  return { ver: info.ver, importer: info.importer, imported: true, uuid, files: info.files, subMetas: {}, userData: structuredClone(info.userData) };
}

function directoryMeta() {
  return { ver: '1.2.0', importer: 'directory', imported: true, uuid: randomUUID(), files: [], subMetas: {}, userData: {} };
}

async function ensureDirectoryChain(assetsDir, directory) {
  const relativeDirectory = relative(assetsDir, directory);
  let current = assetsDir;
  for (const part of relativeDirectory.split(sep).filter(Boolean)) {
    current = join(current, part);
    await mkdir(current, { recursive: true });
    if (!(await exists(`${current}.meta`))) await writeFile(`${current}.meta`, `${JSON.stringify(directoryMeta(), null, 2)}\n`, 'utf8');
  }
}

const options = parseArgs(process.argv.slice(2));
const projectDir = resolve(options.project);
let projectPackage;
try { projectPackage = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf8')); }
catch { usage(`cannot read a valid package.json in ${projectDir}`); }
const creatorVersion = String(projectPackage?.creator?.version ?? '');
if (!/^3\.8(?:\.|$)/.test(creatorVersion)) usage(`expected Cocos Creator 3.8, found ${creatorVersion || 'no creator version'}`);

const sourcePath = resolve(options.source);
const assetsDir = resolve(projectDir, 'assets');
const destinationDir = resolve(assetsDir, options.destination);
if (!isWithin(assetsDir, destinationDir) && destinationDir !== assetsDir) usage('--destination must resolve inside assets');
if (isWithin(sourcePath, destinationDir) || sourcePath === destinationDir) usage('destination cannot be inside source');

try {
  const entries = await collectFiles(sourcePath);
  if (!entries.length) throw new Error('source contains no importable files');
  const supported = [];
  for (const entry of entries) {
    const extension = extname(entry.relativePath).toLowerCase();
    if (extension === '.meta') continue;
    if (extension !== '.png' && extension !== '.skel' && !TYPE_INFO.has(extension)) throw new Error(`unsupported asset type: ${entry.relativePath}`);
    entry.extension = extension;
    entry.destination = resolve(destinationDir, entry.relativePath);
    if (!isWithin(destinationDir, entry.destination) && entry.destination !== destinationDir) throw new Error(`unsafe relative path: ${entry.relativePath}`);
    if (entry.source === entry.destination) throw new Error(`source and destination are the same file: ${entry.source}`);
    if (!options.force && (await exists(entry.destination) || await exists(`${entry.destination}.meta`))) throw new Error(`destination already exists: ${entry.destination}`);
    supported.push(entry);
  }

  const byRelative = new Map(supported.map((entry) => [entry.relativePath.replaceAll('\\', '/').toLowerCase(), entry]));
  for (const entry of supported) {
    if (await exists(`${entry.destination}.meta`)) {
      entry.existingMeta = JSON.parse(await readFile(`${entry.destination}.meta`, 'utf8'));
      entry.uuid = entry.existingMeta.uuid;
    } else entry.uuid = randomUUID();
  }

  for (const entry of supported) {
    if (entry.existingMeta) continue;
    if (entry.extension === '.png') {
      const info = pngInfo(await readFile(entry.source));
      entry.meta = imageMeta(entry.uuid, info.width, info.height, info.hasAlpha);
    } else if (entry.extension === '.skel') {
      const normalized = entry.relativePath.replaceAll('\\', '/');
      const atlasKey = `${normalized.slice(0, -extname(normalized).length)}.atlas`.toLowerCase();
      const atlas = byRelative.get(atlasKey);
      if (!atlas) throw new Error(`Spine skeleton is missing matching atlas: ${entry.relativePath}`);
      entry.meta = { ver: '1.2.7', importer: 'spine-data', imported: true, uuid: entry.uuid, files: ['.bin', '.json'], subMetas: {}, userData: { atlasUuid: atlas.uuid } };
    } else {
      if (entry.extension === '.mtl') {
        let material;
        try { material = JSON.parse(await readFile(entry.source, 'utf8')); } catch { throw new Error(`material must be JSON: ${entry.relativePath}`); }
        if (material?.__type__ !== 'cc.Material') throw new Error(`material must contain __type__ cc.Material: ${entry.relativePath}`);
      }
      entry.meta = basicMeta(entry.uuid, TYPE_INFO.get(entry.extension));
    }
  }

  if (!options.dryRun) {
    await ensureDirectoryChain(assetsDir, destinationDir);
    for (const entry of supported) {
      await ensureDirectoryChain(assetsDir, dirname(entry.destination));
      await copyFile(entry.source, entry.destination);
      if (!entry.existingMeta) await writeFile(`${entry.destination}.meta`, `${JSON.stringify(entry.meta, null, 2)}\n`, 'utf8');
    }
  }

  console.log(`${options.dryRun ? 'Validated import of' : 'Imported'} ${supported.length} asset(s) to ${destinationDir}`);
  for (const entry of supported) console.log(`${entry.relativePath} -> ${entry.existingMeta ? 'preserve existing meta' : entry.meta.importer} (${entry.uuid})`);
} catch (error) { usage(error.message); }
