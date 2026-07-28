import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import test from 'node:test';

const execFileAsync = promisify(execFile);
const cli = resolve('control-cocos-editor/scripts/cocos-editor.mjs');

test('editor CLI authenticates and forwards a request to the local bridge', async () => {
  const project = await mkdtemp(join(tmpdir(), 'cocos-cli-test-'));
  const received = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    received.push(body);
    const result = JSON.stringify({ ok: true, result: { ready: true } });
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(result);
  });
  try {
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    await mkdir(join(project, 'temp'));
    await writeFile(join(project, 'temp', 'cocos-codex-bridge.json'), JSON.stringify({
      schema: 1,
      host: '127.0.0.1',
      port: address.port,
      token: 'test-token'
    }));

    const { stdout } = await execFileAsync(process.execPath, [
      cli, '--project', project, 'request', 'scene', 'query-dirty', '[]'
    ]);
    assert.deepEqual(JSON.parse(stdout), { ready: true });
    assert.equal(received.length, 1);
    assert.equal(received[0].token, 'test-token');
    assert.equal(received[0].target, 'scene');
    assert.equal(received[0].method, 'query-dirty');
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(project, { recursive: true, force: true });
  }
});

test('editor CLI waits until AssetDB becomes idle', async () => {
  const project = await mkdtemp(join(tmpdir(), 'cocos-cli-wait-test-'));
  let busyChecks = 0;
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    let result;
    if (body.target === 'asset-db' && body.method === 'query-ready') result = true;
    else if (body.target === 'asset-db' && body.method === 'is-busy') result = busyChecks++ < 2;
    else throw new Error(`unexpected request: ${body.target}.${body.method}`);
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ ok: true, result }));
  });
  try {
    await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
    const address = server.address();
    await mkdir(join(project, 'temp'));
    await writeFile(join(project, 'temp', 'cocos-codex-bridge.json'), JSON.stringify({
      schema: 1,
      host: '127.0.0.1',
      port: address.port,
      token: 'test-token'
    }));

    const { stdout } = await execFileAsync(process.execPath, [
      cli, '--project', project, '--timeout', '2000', '--poll', '50', 'wait', 'idle'
    ]);
    assert.deepEqual(JSON.parse(stdout), { assetDbReady: true, assetDbBusy: false });
    assert.equal(busyChecks, 3);
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
    await rm(project, { recursive: true, force: true });
  }
});
