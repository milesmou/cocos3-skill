#!/usr/bin/env node

import { readdir, readFile, stat } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

function isWithin(parent, child) {
  const value = relative(parent, child);
  return value !== '..' && !value.startsWith(`..${sep}`) && !isAbsolute(value);
}

async function exists(target) {
  try { await stat(target); return true; } catch { return false; }
}

async function walk(directory, output = []) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'Thumbs.db') continue;
    const fullPath = resolve(directory, entry.name);
    output.push({ path: fullPath, directory: entry.isDirectory() });
    if (entry.isDirectory()) await walk(fullPath, output);
  }
  return output;
}

function addIssue(issues, severity, code, file, message, details = undefined) {
  issues.push({ severity, code, file, message, ...(details === undefined ? {} : { details }) });
}

function collectMetaUuids(meta, file, uuidOwners, issues) {
  const entries = [];
  if (typeof meta.uuid === 'string') entries.push({ uuid: meta.uuid, source: 'uuid' });
  for (const [name, subMeta] of Object.entries(meta.subMetas || {})) {
    if (typeof subMeta?.uuid === 'string') entries.push({ uuid: subMeta.uuid, source: `subMetas.${name}` });
  }
  for (const entry of entries) {
    const normalized = entry.uuid.split('@')[0];
    const owner = uuidOwners.get(normalized);
    if (owner && owner.file !== file) {
      addIssue(issues, 'error', 'duplicate-uuid', file, `UUID is also declared by ${owner.file}`, {
        uuid: normalized,
        current: entry.source,
        previous: owner.source
      });
    } else {
      uuidOwners.set(normalized, { file, source: entry.source });
    }
  }
}

function scanSerialized(value, objectCount, file, issues, referencedUuids, trail = '$') {
  if (!value || typeof value !== 'object') return;
  if (Number.isInteger(value.__id__) && (value.__id__ < 0 || value.__id__ >= objectCount)) {
    addIssue(issues, 'error', 'invalid-object-reference', file, `Object reference ${value.__id__} is out of range`, { trail, objectCount });
  }
  if (typeof value.__uuid__ === 'string') referencedUuids.add(value.__uuid__.split('@')[0]);
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      scanSerialized(value[index], objectCount, file, issues, referencedUuids, `${trail}[${index}]`);
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    scanSerialized(child, objectCount, file, issues, referencedUuids, `${trail}.${key}`);
  }
}

export async function validateProject(projectInput) {
  const project = resolve(projectInput);
  const assets = resolve(project, 'assets');
  if (!isWithin(project, assets) || !(await exists(assets))) throw new Error(`assets directory not found: ${assets}`);

  const issues = [];
  let projectPackage;
  try { projectPackage = JSON.parse(await readFile(resolve(project, 'package.json'), 'utf8')); }
  catch { throw new Error(`cannot read project package.json: ${resolve(project, 'package.json')}`); }
  const creatorVersion = String(projectPackage?.creator?.version || '');
  if (!/^3\.8(?:\.|$)/.test(creatorVersion)) {
    addIssue(issues, 'error', 'creator-version', 'package.json', `Expected Cocos Creator 3.8.x, found ${creatorVersion || '<missing>'}`);
  }

  const entries = await walk(assets);
  const uuidOwners = new Map();
  const referencedUuids = new Set();
  const serializedFiles = [];

  for (const entry of entries) {
    const relativePath = relative(project, entry.path).replaceAll('\\', '/');
    if (entry.path.endsWith('.meta')) {
      const sourcePath = entry.path.slice(0, -'.meta'.length);
      if (!(await exists(sourcePath))) {
        addIssue(issues, 'error', 'orphan-meta', relativePath, 'Meta file has no corresponding asset');
      }
      try {
        const meta = JSON.parse(await readFile(entry.path, 'utf8'));
        collectMetaUuids(meta, relativePath, uuidOwners, issues);
      } catch (error) {
        addIssue(issues, 'error', 'invalid-meta-json', relativePath, error.message);
      }
      continue;
    }

    if (!(await exists(`${entry.path}.meta`))) {
      addIssue(issues, 'error', 'missing-meta', relativePath, 'Asset or directory has no companion .meta file');
    }

    if (!entry.directory && ['.prefab', '.scene'].includes(extname(entry.path).toLowerCase())) {
      serializedFiles.push(entry);
    }
  }

  for (const entry of serializedFiles) {
    const relativePath = relative(project, entry.path).replaceAll('\\', '/');
    try {
      const objects = JSON.parse(await readFile(entry.path, 'utf8'));
      if (!Array.isArray(objects) || objects.length === 0) {
        addIssue(issues, 'error', 'invalid-object-table', relativePath, 'Serialized scene or prefab must be a non-empty array');
        continue;
      }
      scanSerialized(objects, objects.length, relativePath, issues, referencedUuids);
    } catch (error) {
      addIssue(issues, 'error', 'invalid-serialized-json', relativePath, error.message);
    }
  }

  for (const uuid of referencedUuids) {
    if (!uuidOwners.has(uuid)) {
      addIssue(issues, 'warning', 'unresolved-asset-uuid', '<serialized-assets>', 'UUID is not declared under project assets; it may belong to an internal or mounted database', { uuid });
    }
  }

  const errors = issues.filter((issue) => issue.severity === 'error').length;
  const warnings = issues.length - errors;
  return {
    project,
    creatorVersion,
    valid: errors === 0,
    summary: {
      assets: entries.filter((entry) => !entry.path.endsWith('.meta')).length,
      metas: entries.filter((entry) => entry.path.endsWith('.meta')).length,
      serializedFiles: serializedFiles.length,
      uuids: uuidOwners.size,
      errors,
      warnings
    },
    issues
  };
}

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node validate-project.mjs --project <dir> [--json]');
  process.exit(message ? 1 : 0);
}

async function runCli() {
  const argv = process.argv.slice(2);
  let project;
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') project = argv[++index];
    else if (argv[index] === '--json') json = true;
    else if (argv[index] === '--help' || argv[index] === '-h') usage();
    else usage(`unknown argument: ${argv[index]}`);
  }
  if (!project) usage('--project is required');
  try {
    const result = await validateProject(project);
    if (json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(`Cocos ${result.creatorVersion}: ${result.summary.assets} assets, ${result.summary.serializedFiles} scene/prefab files`);
      for (const issue of result.issues) {
        console.log(`${issue.severity.toUpperCase()} ${issue.code} ${issue.file}: ${issue.message}`);
      }
      console.log(`${result.summary.errors} error(s), ${result.summary.warnings} warning(s)`);
    }
    if (!result.valid) process.exitCode = 1;
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  }
}

if (resolve(process.argv[1] || '') === resolve(fileURLToPath(import.meta.url))) {
  await runCli();
}
