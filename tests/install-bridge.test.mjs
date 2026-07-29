import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const installer = resolve('control-cocos-editor/scripts/install-bridge.mjs');

test('bridge installer installs and removes the extension in a Creator 3.8 project', async () => {
  const project = await mkdtemp(join(tmpdir(), 'cocos-bridge-test-'));
  try {
    await writeFile(join(project, 'package.json'), JSON.stringify({ creator: { version: '3.8.8' } }));
    await execFileAsync(process.execPath, [installer, '--project', project]);

    const installedPackage = join(project, 'extensions', 'cocos3-codex-bridge', 'package.json');
    const manifest = JSON.parse(await readFile(installedPackage, 'utf8'));
    assert.equal(manifest.name, 'cocos3-codex-bridge');
    assert.equal(manifest.version, '1.2.2');
    assert.equal(manifest.panels.preview.main, './preview.js');
    const installedScene = join(project, 'extensions', 'cocos3-codex-bridge', 'scene.js');
    const sceneSource = await readFile(installedScene, 'utf8');
    assert.match(sceneSource, /'setEditClip'/);
    const installedMain = join(project, 'extensions', 'cocos3-codex-bridge', 'main.js');
    const mainSource = await readFile(installedMain, 'utf8');
    assert.match(mainSource, /editorDirectory: path\.dirname\(process\.execPath\)/);
    const installedPreview = join(project, 'extensions', 'cocos3-codex-bridge', 'preview.js');
    const previewSource = await readFile(installedPreview, 'utf8');
    assert.match(previewSource, /callPreview\('is2DView'\)/);
    assert.match(previewSource, /callPreview\('viewToggle'\)/);
    assert.match(previewSource, /previewMode: '2D'/);

    await execFileAsync(process.execPath, [installer, '--project', project, '--remove']);
    await assert.rejects(stat(installedPackage));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
