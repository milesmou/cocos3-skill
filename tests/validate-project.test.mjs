import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { validateProject } from '../validate-cocos-content/scripts/validate-project.mjs';

async function json(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`);
}

test('validateProject reports broken object references and missing metadata', async () => {
  const project = await mkdtemp(join(tmpdir(), 'cocos-skill-test-'));
  try {
    const assets = join(project, 'assets');
    await mkdir(assets);
    await json(join(project, 'package.json'), { creator: { version: '3.8.8' } });
    await json(join(assets, 'broken.prefab'), [
      { __type__: 'cc.Prefab', data: { __id__: 8 } },
      { __type__: 'cc.Node', _name: 'Root' }
    ]);
    await json(join(assets, 'broken.prefab.meta'), { uuid: '11111111-1111-4111-8111-111111111111', subMetas: {} });
    await writeFile(join(assets, 'missing-meta.txt'), 'x');

    const result = await validateProject(project);
    assert.equal(result.valid, false);
    assert(result.issues.some((issue) => issue.code === 'invalid-object-reference'));
    assert(result.issues.some((issue) => issue.code === 'missing-meta'));
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});

test('validateProject accepts a minimal internally consistent prefab', async () => {
  const project = await mkdtemp(join(tmpdir(), 'cocos-skill-test-'));
  try {
    const assets = join(project, 'assets');
    await mkdir(assets);
    await json(join(project, 'package.json'), { creator: { version: '3.8.8' } });
    await json(join(assets, 'ok.prefab'), [
      { __type__: 'cc.Prefab', data: { __id__: 1 } },
      { __type__: 'cc.Node', _name: 'Root', _children: [], _components: [] }
    ]);
    await json(join(assets, 'ok.prefab.meta'), { uuid: '22222222-2222-4222-8222-222222222222', subMetas: {} });

    const result = await validateProject(project);
    assert.equal(result.valid, true);
    assert.equal(result.summary.errors, 0);
  } finally {
    await rm(project, { recursive: true, force: true });
  }
});
