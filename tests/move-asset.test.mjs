import assert from 'node:assert/strict';
import { mkdtemp, readFile, rename, rm, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { movePair } from '../move-cocos-asset/scripts/move-pair.mjs';

for (const failure of ['none', 'metadata', 'rollback']) {
  test(`move pair preserves recoverable files after ${failure} failure`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'cocos-move-pair-'));
    const source = join(directory, 'source.txt');
    const destination = join(directory, 'target.txt');
    try {
      await writeFile(source, 'resource');
      await writeFile(`${source}.meta`, '{"uuid":"preserved-uuid"}');
      const operation = movePair(source, destination, async (from, to) => {
        if (failure !== 'none' && from === `${source}.meta`) throw new Error('metadata blocked');
        if (failure === 'rollback' && from === destination) throw new Error('rollback blocked');
        await rename(from, to);
      });
      if (failure === 'none') {
        await operation;
      } else {
        await assert.rejects(operation, (error) => {
          assert(error.message.includes('metadata blocked'));
          assert(error.message.includes(`${source}.meta`));
          if (failure === 'rollback') {
            assert(error instanceof AggregateError);
            assert.equal(error.errors.length, 2);
            assert(error.message.includes('rollback blocked'));
            assert(error.message.includes(destination));
          } else {
            assert(error.message.includes(`restored to ${source}`));
          }
          return true;
        });
      }
      const resourcePath = failure === 'metadata' ? source : destination;
      const metaPath = failure === 'none' ? `${destination}.meta` : `${source}.meta`;
      assert.equal(await readFile(resourcePath, 'utf8'), 'resource');
      assert.equal(await readFile(metaPath, 'utf8'), '{"uuid":"preserved-uuid"}');
      await assert.rejects(access(resourcePath === source ? destination : source), { code: 'ENOENT' });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
