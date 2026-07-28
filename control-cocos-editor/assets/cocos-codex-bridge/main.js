'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const packageJSON = require('./package.json');

const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const CONNECTION_FILE = 'cocos-codex-bridge.json';
const ALLOWED_MESSAGES = {
  scene: new Set([
    'open-scene', 'save-scene', 'save-as-scene', 'close-scene',
    'set-property', 'reset-property', 'move-array-element', 'remove-array-element',
    'copy-node', 'duplicate-node', 'paste-node', 'cut-node', 'set-parent',
    'create-node', 'remove-node', 'reset-node', 'reset-component',
    'restore-prefab', 'create-component', 'remove-component',
    'execute-component-method', 'snapshot', 'snapshot-abort', 'soft-reload',
    'query-is-ready', 'query-node', 'query-component', 'query-node-tree',
    'query-nodes-by-asset-uuid', 'query-dirty', 'query-classes',
    'query-components', 'query-component-has-script', 'query-scene-bounds'
  ]),
  'asset-db': new Set([
    'query-ready', 'create-asset', 'import-asset', 'copy-asset', 'move-asset',
    'delete-asset', 'open-asset', 'save-asset', 'save-asset-meta',
    'reimport-asset', 'refresh-asset', 'query-asset-info',
    'query-missing-asset-info', 'query-asset-meta', 'query-path', 'query-url',
    'query-uuid', 'query-assets', 'generate-available-url',
    'query-asset-dependencies', 'query-asset-users', 'query-asset-data',
    'is-busy', 'refresh'
  ])
};

let server = null;
let token = '';
let connectionPath = '';

function projectPath() {
  return Editor.Project.path;
}

function writeJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store'
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body exceeds 2 MiB');
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
}

async function dispatch(payload) {
  const args = Array.isArray(payload.args) ? payload.args : [];
  if (payload.target === 'bridge') {
    if (payload.method !== 'status') throw new Error(`unsupported bridge method: ${payload.method}`);
    return {
      name: packageJSON.name,
      version: packageJSON.version,
      creator: Editor.App.version,
      project: projectPath(),
      sceneReady: await Editor.Message.request('scene', 'query-is-ready'),
      assetDbReady: await Editor.Message.request('asset-db', 'query-ready')
    };
  }
  if (payload.target === 'scene-script') {
    if (typeof payload.method !== 'string' || !payload.method) throw new Error('scene-script method is required');
    return Editor.Message.request('scene', 'execute-scene-script', {
      name: packageJSON.name,
      method: payload.method,
      args
    });
  }
  const methods = ALLOWED_MESSAGES[payload.target];
  if (!methods?.has(payload.method)) {
    throw new Error(`message is not allowed: ${payload.target}.${payload.method}`);
  }
  return Editor.Message.request(payload.target, payload.method, ...args);
}

async function handle(request, response) {
  if (request.method !== 'POST' || request.url !== '/request') {
    writeJson(response, 404, { ok: false, error: 'not found' });
    return;
  }
  try {
    const payload = await readBody(request);
    if (!payload || payload.token !== token) {
      writeJson(response, 401, { ok: false, error: 'invalid bridge token' });
      return;
    }
    const result = await dispatch(payload);
    writeJson(response, 200, { ok: true, result: result === undefined ? null : result });
  } catch (error) {
    writeJson(response, 400, {
      ok: false,
      error: error instanceof Error ? error.message : String(error)
    });
  }
}

function removeConnectionFile() {
  if (!connectionPath) return;
  try {
    const current = JSON.parse(fs.readFileSync(connectionPath, 'utf8'));
    if (current.token === token) fs.rmSync(connectionPath, { force: true });
  } catch {
    // The file may already be absent or belong to a newer editor process.
  }
}

function startServer() {
  token = crypto.randomBytes(32).toString('hex');
  connectionPath = path.join(projectPath(), 'temp', CONNECTION_FILE);
  fs.mkdirSync(path.dirname(connectionPath), { recursive: true });
  server = http.createServer((request, response) => {
    void handle(request, response);
  });
  server.on('error', (error) => {
    console.error(`[${packageJSON.name}] ${error.message}`);
  });
  server.listen(0, HOST, () => {
    const address = server.address();
    fs.writeFileSync(connectionPath, JSON.stringify({
      schema: 1,
      host: HOST,
      port: address.port,
      token,
      pid: process.pid,
      project: projectPath(),
      creator: Editor.App.version,
      extensionVersion: packageJSON.version
    }, null, 2));
    console.log(`[${packageJSON.name}] listening on ${HOST}:${address.port}`);
  });
}

exports.methods = {
  bridgeStatus() {
    return { running: Boolean(server?.listening), connectionPath };
  }
};

exports.load = function load() {
  startServer();
};

exports.unload = function unload() {
  removeConnectionFile();
  if (server) {
    server.close();
    server = null;
  }
};
