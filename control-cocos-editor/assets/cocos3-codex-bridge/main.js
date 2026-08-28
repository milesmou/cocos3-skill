'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const packageJSON = require('./package.json');

const HOST = '127.0.0.1';
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const CONNECTION_FILE = 'cocos3-codex-bridge.json';
const PREVIEW_PANEL = `${packageJSON.name}.preview`;
/** 等待普通 Web 预览返回一次节点快照的最长时间，单位毫秒。 */
const RUNTIME_REQUEST_TIMEOUT_MS = 5000;
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
/** 接收普通 Web 预览连接的本机只读中继服务。 */
let runtimeServer = null;
/** 中继当前监听端口；0 表示不可用。 */
let runtimePort = 0;
/** 已连接的普通 Web 预览实例，键为实例 ID。 */
const runtimeClients = new Map();
/** 等待预览返回的节点快照请求，键为随机请求 ID。 */
const runtimeRequests = new Map();

function projectPath() {
  return Editor.Project.path;
}

function isWithin(parent, child) {
  const value = path.relative(parent, child);
  return value !== '..' && !value.startsWith(`..${path.sep}`) && !path.isAbsolute(value);
}

function requirePrefabPreviewVersion() {
  const match = String(Editor.App.version || '').match(/^3\.8\.(\d+)/);
  if (!match || Number(match[1]) < 5) {
    throw new Error(`internal Prefab preview export requires Cocos Creator 3.8.5-3.8.x; found ${Editor.App.version || '<unknown>'}`);
  }
}

async function exportPrefabPreview(options = {}) {
  requirePrefabPreviewVersion();
  if (typeof options.asset !== 'string' || !options.asset) throw new Error('preview asset URL, UUID, or path is required');
  if (typeof options.output !== 'string' || !options.output) throw new Error('preview output PNG path is required');
  const width = Number(options.width ?? 1024);
  const height = Number(options.height ?? 768);
  if (!Number.isInteger(width) || width < 64 || width > 4096) throw new Error('preview width must be an integer from 64 to 4096');
  if (!Number.isInteger(height) || height < 64 || height > 4096) throw new Error('preview height must be an integer from 64 to 4096');

  const info = await Editor.Message.request('asset-db', 'query-asset-info', options.asset);
  if (!info?.uuid) throw new Error(`Prefab asset not found: ${options.asset}`);
  const assetUrl = String(info.url || '');
  if (!assetUrl.endsWith('.prefab') && info.importer !== 'prefab') {
    throw new Error(`asset is not a Prefab: ${info.url || options.asset}`);
  }

  const output = path.resolve(projectPath(), options.output);
  if (!isWithin(projectPath(), output)) throw new Error('preview output must stay inside the project');
  if (path.extname(output).toLowerCase() !== '.png') throw new Error('preview output must use the .png extension');

  const wasOpen = await Editor.Panel.has(PREVIEW_PANEL);
  if (!wasOpen && !(await Editor.Panel.open(PREVIEW_PANEL))) {
    throw new Error('failed to open the internal Prefab preview renderer panel');
  }
  try {
    return await Editor.Message.request(packageJSON.name, 'render-prefab-preview', {
      uuid: info.uuid,
      url: info.url,
      output,
      width,
      height,
      settleFrames: Number.isInteger(options.settleFrames) ? options.settleFrames : 3
    });
  } finally {
    if (!wasOpen) await Editor.Panel.close(PREVIEW_PANEL);
  }
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

/** 读取运行时中继的 UTF-8 文本请求体，并限制最大字节数。 */
async function readTextBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_BODY_BYTES) throw new Error('request body exceeds 2 MiB');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

/** 返回项目配置的 Creator Web 预览端口。 */
function configuredPreviewPort() {
  const profile = path.join(projectPath(), 'profiles', 'v2', 'packages', 'server.json');
  try {
    const value = JSON.parse(fs.readFileSync(profile, 'utf8'))?.server_port;
    if (Number.isInteger(value) && value > 0 && value < 65535) return value;
  } catch {
    // Creator defaults to 7456 when the project profile is absent or incomplete.
  }
  return 7456;
}

/** 仅允许同项目本机 Web 预览页面访问运行时中继。 */
function isAllowedRuntimeOrigin(request) {
  const origin = request.headers.origin;
  if (!origin || origin === 'null') return true;
  try {
    const url = new URL(origin);
    return (url.hostname === '127.0.0.1' || url.hostname === 'localhost')
      && Number(url.port || (url.protocol === 'https:' ? 443 : 80)) === configuredPreviewPort();
  } catch {
    return false;
  }
}

/** 创建运行时中继响应所需的本机跨端口响应头。 */
function runtimeHeaders(contentType) {
  return {
    'access-control-allow-origin': '*',
    'cache-control': 'no-store',
    'content-type': contentType
  };
}

/** 向普通 Web 预览写入 JSON 中继响应。 */
function writeRuntimeJson(response, status, payload) {
  const body = JSON.stringify(payload);
  response.writeHead(status, {
    ...runtimeHeaders('application/json; charset=utf-8'),
    'content-length': Buffer.byteLength(body)
  });
  response.end(body);
}

/** 完成节点快照请求，并保留多预览实例的部分超时信息。 */
function finishRuntimeRequest(requestId, timedOut = false) {
  const pending = runtimeRequests.get(requestId);
  if (!pending) return;
  runtimeRequests.delete(requestId);
  clearTimeout(pending.timer);
  pending.resolve({
    runtimePort,
    instanceCount: pending.results.length,
    timedOut,
    missingInstances: [...pending.expected],
    snapshots: pending.results
  });
}

/** 处理普通 Web 预览的事件流连接和快照回传。 */
async function handleRuntimeRequest(request, response) {
  if (!isAllowedRuntimeOrigin(request)) {
    writeRuntimeJson(response, 403, { ok: false, error: 'runtime origin is not allowed' });
    return;
  }
  const requestUrl = new URL(request.url, `http://${HOST}:${runtimePort}`);
  if (request.method === 'GET' && requestUrl.pathname === '/runtime/events') {
    const instanceId = String(requestUrl.searchParams.get('instance') || '');
    if (!/^[a-zA-Z0-9_-]{8,80}$/.test(instanceId)) {
      writeRuntimeJson(response, 400, { ok: false, error: 'invalid runtime instance id' });
      return;
    }
    const previous = runtimeClients.get(instanceId);
    if (previous && previous !== response && !previous.writableEnded) previous.end();
    response.writeHead(200, {
      ...runtimeHeaders('text/event-stream; charset=utf-8'),
      connection: 'keep-alive'
    });
    response.write('retry: 1000\n\n');
    runtimeClients.set(instanceId, response);
    request.on('close', () => {
      if (runtimeClients.get(instanceId) === response) runtimeClients.delete(instanceId);
    });
    return;
  }
  if (request.method === 'POST' && requestUrl.pathname === '/runtime/result') {
    const requestId = String(requestUrl.searchParams.get('request') || '');
    const instanceId = String(requestUrl.searchParams.get('instance') || '');
    const pending = runtimeRequests.get(requestId);
    if (!pending || !pending.expected.has(instanceId)) {
      writeRuntimeJson(response, 404, { ok: false, error: 'runtime request not found' });
      return;
    }
    const payload = JSON.parse(await readTextBody(request) || '{}');
    pending.expected.delete(instanceId);
    pending.results.push(payload);
    writeRuntimeJson(response, 200, { ok: true });
    if (pending.expected.size === 0) finishRuntimeRequest(requestId);
    return;
  }
  writeRuntimeJson(response, 404, { ok: false, error: 'runtime endpoint not found' });
}

/** 请求所有已连接普通 Web 预览各返回一次节点统计快照。 */
function requestRuntimeNodeStats(options = {}) {
  const clients = [...runtimeClients.entries()].filter(([, response]) => !response.writableEnded);
  if (clients.length === 0) {
    throw new Error('no runtime inspector is connected; run or refresh the normal Creator Web preview after installing preview-template');
  }
  const requestId = crypto.randomBytes(16).toString('hex');
  return new Promise((resolve, reject) => {
    const expected = new Set(clients.map(([instanceId]) => instanceId));
    const pending = {
      expected,
      results: [],
      resolve,
      reject,
      timer: setTimeout(() => {
        if (pending.results.length > 0) finishRuntimeRequest(requestId, true);
        else {
          runtimeRequests.delete(requestId);
          reject(new Error(`runtime node stats timed out after ${RUNTIME_REQUEST_TIMEOUT_MS} ms`));
        }
      }, RUNTIME_REQUEST_TIMEOUT_MS)
    };
    runtimeRequests.set(requestId, pending);
    const event = `data: ${JSON.stringify({ requestId, type: 'node-stats', options })}\n\n`;
    for (const [instanceId, response] of clients) {
      try {
        response.write(event);
      } catch {
        expected.delete(instanceId);
        runtimeClients.delete(instanceId);
      }
    }
    if (expected.size === 0) {
      runtimeRequests.delete(requestId);
      clearTimeout(pending.timer);
      reject(new Error('all runtime inspector connections closed before the request was sent'));
    }
  });
}

async function dispatch(payload) {
  const args = Array.isArray(payload.args) ? payload.args : [];
  if (payload.target === 'bridge') {
    if (payload.method === 'status') {
      return {
        name: packageJSON.name,
        version: packageJSON.version,
        creator: Editor.App.version,
        editorDirectory: path.dirname(process.execPath),
        project: projectPath(),
        sceneReady: await Editor.Message.request('scene', 'query-is-ready'),
        assetDbReady: await Editor.Message.request('asset-db', 'query-ready'),
        prefabPreviewPng: /^3\.8\.(?:[5-9]|\d{2,})/.test(String(Editor.App.version || '')),
        runtimeInspector: {
          port: runtimePort || null,
          connectedInstances: runtimeClients.size
        }
      };
    }
    if (payload.method === 'export-prefab-preview') return exportPrefabPreview(args[0]);
    if (payload.method === 'runtime-node-stats') return requestRuntimeNodeStats(args[0]);
    throw new Error(`unsupported bridge method: ${payload.method}`);
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

/** 在预览端口后一端口启动本机运行时状态中继。 */
function startRuntimeServer() {
  runtimePort = configuredPreviewPort() + 1;
  runtimeServer = http.createServer((request, response) => {
    void handleRuntimeRequest(request, response).catch((error) => {
      if (!response.headersSent) {
        writeRuntimeJson(response, 400, { ok: false, error: error instanceof Error ? error.message : String(error) });
      } else {
        response.end();
      }
    });
  });
  runtimeServer.on('error', (error) => {
    console.error(`[${packageJSON.name}] runtime inspector unavailable on ${HOST}:${runtimePort}: ${error.message}`);
    runtimePort = 0;
  });
  runtimeServer.listen(runtimePort, HOST, () => {
    console.log(`[${packageJSON.name}] runtime inspector listening on ${HOST}:${runtimePort}`);
  });
}

exports.methods = {
  bridgeStatus() {
    return { running: Boolean(server?.listening), connectionPath };
  }
};

exports.load = function load() {
  startServer();
  startRuntimeServer();
};

exports.unload = function unload() {
  removeConnectionFile();
  if (server) {
    server.close();
    server = null;
  }
  for (const response of runtimeClients.values()) response.end();
  runtimeClients.clear();
  for (const [requestId, pending] of runtimeRequests) {
    clearTimeout(pending.timer);
    pending.reject(new Error('runtime inspector stopped'));
    runtimeRequests.delete(requestId);
  }
  if (runtimeServer) {
    runtimeServer.close();
    runtimeServer = null;
  }
  runtimePort = 0;
};
