import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const renameAsset = resolve('rename-cocos-asset/scripts/rename-asset.mjs');

test('case-only asset rename keeps its intermediate files under project temp', async () => {
  const project = await mkdtemp(join(tmpdir(), 'cocos-rename-asset-test-'));
  const assets = join(project, 'assets');
  try {
    await mkdir(assets, { recursive: true });
    await writeFile(join(project, 'package.json'), JSON.stringify({ creator: { version: '3.8.8' } }));
    await writeFile(join(assets, 'Icon.txt'), 'asset-content');
    await writeFile(join(assets, 'Icon.txt.meta'), '{"uuid":"asset-uuid"}');

    await execFileAsync(process.execPath, [
      renameAsset,
      '--project', project,
      '--asset', 'Icon.txt',
      '--name', 'icon.txt'
    ]);

    assert.equal(await readFile(join(assets, 'icon.txt'), 'utf8'), 'asset-content');
    assert.equal(await readFile(join(assets, 'icon.txt.meta'), 'utf8'), '{"uuid":"asset-uuid"}');
    const assetEntries = await readdir(assets);
    assert.deepEqual(assetEntries.sort(), ['icon.txt', 'icon.txt.meta']);
    assert.deepEqual(await readdir(join(project, 'temp', 'rename-cocos-asset')), []);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
