import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';
import { validateProject } from '../validate-cocos-content/scripts/validate-project.mjs';

const execFileAsync = promisify(execFile);
const createPrefab = resolve('create-cocos-prefab/scripts/create-prefab.mjs');
const renameNode = resolve('rename-cocos-prefab-node/scripts/rename-node.mjs');

async function createProject(prefix) {
  const root = await mkdtemp(join(tmpdir(), prefix));
  const project = join(root, 'project');
  await mkdir(join(project, 'assets'), { recursive: true });
  await writeFile(join(project, 'package.json'), JSON.stringify({ creator: { version: '3.8.5' } }));
  return { root, project };
}

async function runCreate(project, ...extra) {
  return execFileAsync(process.execPath, [
    createPrefab,
    '--project', project,
    '--path', 'ui/dialog/View.prefab',
    ...extra
  ]);
}

test('creates metadata for newly created parent directories', async () => {
  const { root, project } = await createProject('cocos-create-prefab-directories-');
  try {
    await runCreate(project);

    for (const metaPath of [join(project, 'assets', 'ui.meta'), join(project, 'assets', 'ui', 'dialog.meta')]) {
      const meta = JSON.parse(await readFile(metaPath, 'utf8'));
      assert.equal(meta.importer, 'directory');
      assert.match(meta.uuid, /^[0-9a-f-]{36}$/);
    }
    const validation = await validateProject(project);
    assert.equal(validation.valid, true, JSON.stringify(validation.issues));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('--force rebuilds Prefab contents while preserving its metadata UUID', async () => {
  const { root, project } = await createProject('cocos-create-prefab-force-');
  const prefabPath = join(project, 'assets', 'ui', 'dialog', 'View.prefab');
  const metaPath = `${prefabPath}.meta`;
  try {
    await runCreate(project, '--size', '100,100');
    const originalMeta = JSON.parse(await readFile(metaPath, 'utf8'));
    originalMeta.userData.customSetting = 'preserved';
    await writeFile(metaPath, `${JSON.stringify(originalMeta, null, 2)}\n`);

    await runCreate(project, '--size', '320,180', '--force');

    const replacedMeta = JSON.parse(await readFile(metaPath, 'utf8'));
    const objects = JSON.parse(await readFile(prefabPath, 'utf8'));
    assert.equal(replacedMeta.uuid, originalMeta.uuid);
    assert.equal(replacedMeta.userData.customSetting, 'preserved');
    assert.deepEqual(objects[2]._contentSize, { __type__: 'cc.Size', width: 320, height: 180 });
    assert.deepEqual((await readdir(join(project, 'assets', 'ui', 'dialog'))).sort(), ['View.prefab', 'View.prefab.meta']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('renames a Prefab root and metadata together without changing its UUID', async () => {
  const { root, project } = await createProject('cocos-rename-prefab-root-');
  const prefabPath = join(project, 'assets', 'ui', 'dialog', 'View.prefab');
  const metaPath = `${prefabPath}.meta`;
  try {
    await runCreate(project);
    const originalMeta = JSON.parse(await readFile(metaPath, 'utf8'));

    await execFileAsync(process.execPath, [
      renameNode,
      '--project', project,
      '--prefab', 'ui/dialog/View.prefab',
      '--node', 'View',
      '--name', 'RenamedView'
    ]);

    const objects = JSON.parse(await readFile(prefabPath, 'utf8'));
    const renamedMeta = JSON.parse(await readFile(metaPath, 'utf8'));
    assert.equal(objects[0]._name, 'RenamedView');
    assert.equal(objects[1]._name, 'RenamedView');
    assert.equal(renamedMeta.uuid, originalMeta.uuid);
    assert.equal(renamedMeta.userData.syncNodeName, 'RenamedView');
    assert.deepEqual((await readdir(join(project, 'assets', 'ui', 'dialog'))).sort(), ['View.prefab', 'View.prefab.meta']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
