import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const importer = resolve('import-cocos-assets/scripts/import-assets.mjs');

test('renames an imported asset when its name or meta is already used', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cocos-import-assets-'));
  const project = join(root, 'project');
  const source = join(root, 'source');
  const destination = join(project, 'assets', 'textures');

  try {
    await mkdir(destination, { recursive: true });
    await mkdir(source, { recursive: true });
    await writeFile(join(project, 'package.json'), JSON.stringify({ creator: { version: '3.8.5' } }));
    await writeFile(join(source, 'icon.txt'), 'new asset');
    await writeFile(join(destination, 'icon.txt'), 'existing asset');
    await writeFile(join(destination, 'icon_1.txt.meta'), '{}');

    const result = await execFileAsync(process.execPath, [
      importer,
      '--project', project,
      '--source', join(source, 'icon.txt'),
      '--destination', 'textures'
    ]);

    assert.match(result.stdout, /icon\.txt -> icon_2\.txt \(renamed\)/);
    assert.equal(await readFile(join(destination, 'icon.txt'), 'utf8'), 'existing asset');
    assert.equal(await readFile(join(destination, 'icon_2.txt'), 'utf8'), 'new asset');
    const meta = JSON.parse(await readFile(join(destination, 'icon_2.txt.meta'), 'utf8'));
    assert.equal(meta.importer, 'text');
    assert.match(meta.uuid, /^[0-9a-f-]{36}$/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('updates a Spine atlas when a referenced PNG is renamed', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cocos-import-spine-'));
  const project = join(root, 'project');
  const source = join(root, 'source');
  const destination = join(project, 'assets', 'spine');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAF/gL+XqQnWQAAAABJRU5ErkJggg==', 'base64');

  try {
    await mkdir(destination, { recursive: true });
    await mkdir(source, { recursive: true });
    await writeFile(join(project, 'package.json'), JSON.stringify({ creator: { version: '3.8.5' } }));
    await writeFile(join(source, 'hero.skel'), 'skeleton');
    await writeFile(join(source, 'hero.atlas'), 'hero.png\nsize: 1,1\n');
    await writeFile(join(source, 'hero.png'), png);
    await writeFile(join(destination, 'hero.png'), png);

    await execFileAsync(process.execPath, [
      importer,
      '--project', project,
      '--source', source,
      '--destination', 'spine'
    ]);

    assert.match(await readFile(join(destination, 'hero.atlas'), 'utf8'), /^hero_1\.png$/m);
    assert.deepEqual(await readFile(join(destination, 'hero_1.png')), png);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
