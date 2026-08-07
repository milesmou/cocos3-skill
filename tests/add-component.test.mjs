import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const addComponent = resolve('add-cocos-node-component/scripts/add-component.mjs');

test('refuses to add the same component type to a Prefab node twice', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cocos-add-component-'));
  const project = join(root, 'project');
  const prefabPath = join(project, 'assets', 'ui', 'view.prefab');
  const prefab = [
    { __type__: 'cc.Prefab', data: { __id__: 1 } },
    { __type__: 'cc.Node', _name: 'Root', _children: [], _components: [] }
  ];

  try {
    await mkdir(join(project, 'assets', 'ui'), { recursive: true });
    await writeFile(join(project, 'package.json'), JSON.stringify({ creator: { version: '3.8.5' } }));
    await writeFile(prefabPath, JSON.stringify(prefab));

    const args = [
      addComponent,
      '--project', project,
      '--prefab', 'ui/view.prefab',
      '--node', 'Root',
      '--component', 'Label'
    ];
    await execFileAsync(process.execPath, args);
    const afterFirstAdd = await readFile(prefabPath, 'utf8');

    await assert.rejects(
      execFileAsync(process.execPath, args),
      (error) => error.code === 1 && /already has component cc\.Label/.test(error.stderr)
    );

    assert.equal(await readFile(prefabPath, 'utf8'), afterFirstAdd);
    const objects = JSON.parse(afterFirstAdd);
    const componentTypes = objects[1]._components.map(({ __id__ }) => objects[__id__].__type__);
    assert.deepEqual(componentTypes, ['cc.Label']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
