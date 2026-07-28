#!/usr/bin/env node

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error([
    'Usage:',
    '  node cocos-editor.mjs --project <dir> status',
    '  node cocos-editor.mjs --project <dir> [--timeout <ms>] [--poll <ms>] wait <ready|idle>',
    '  node cocos-editor.mjs --project <dir> request <scene|asset-db|scene-script> <method> [args-json]',
    '',
    'args-json must be a JSON array. Example:',
    '  node cocos-editor.mjs --project . request scene query-node \'["node-uuid"]\''
  ].join('\n'));
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--project') options.project = argv[++index];
    else if (argv[index] === '--timeout') options.timeout = Number(argv[++index]);
    else if (argv[index] === '--poll') options.poll = Number(argv[++index]);
    else if (argv[index] === '--help' || argv[index] === '-h') usage();
    else positional.push(argv[index]);
  }
  if (!options.project) usage('--project is required');
  options.command = positional[0];
  options.target = positional[1];
  options.method = positional[2];
  options.argsJson = positional[3] || '[]';
  options.timeout = Number.isFinite(options.timeout) && options.timeout > 0 ? options.timeout : 15000;
  options.poll = Number.isFinite(options.poll) && options.poll >= 50 ? options.poll : 250;
  return options;
}

async function connection(project) {
  const file = resolve(project, 'temp', 'cocos-codex-bridge.json');
  let data;
  try { data = JSON.parse(await readFile(file, 'utf8')); }
  catch { throw new Error(`bridge connection file not found: ${file}; install/enable the extension and keep Creator open`); }
  if (data.schema !== 1 || data.host !== '127.0.0.1' || !Number.isInteger(data.port) || !data.token) {
    throw new Error(`invalid bridge connection file: ${file}`);
  }
  return data;
}

async function requestBridge(info, payload, timeout) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(`http://${info.host}:${info.port}/request`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token: info.token, ...payload }),
      signal: controller.signal
    });
    const data = await response.json();
    if (!response.ok || !data.ok) throw new Error(data.error || `bridge returned HTTP ${response.status}`);
    return data.result;
  } finally {
    clearTimeout(timer);
  }
}

async function waitFor(info, condition, timeout, poll) {
  const deadline = Date.now() + timeout;
  let last;
  do {
    if (condition === 'ready') {
      last = await requestBridge(info, { target: 'bridge', method: 'status', args: [] }, Math.min(5000, timeout));
      if (last.sceneReady && last.assetDbReady) return last;
    } else if (condition === 'idle') {
      const ready = await requestBridge(info, { target: 'asset-db', method: 'query-ready', args: [] }, Math.min(5000, timeout));
      const busy = ready
        ? await requestBridge(info, { target: 'asset-db', method: 'is-busy', args: [] }, Math.min(5000, timeout))
        : true;
      last = { assetDbReady: ready, assetDbBusy: busy };
      if (ready && !busy) return last;
    } else {
      usage('wait condition must be ready or idle');
    }
    await new Promise((resolveWait) => setTimeout(resolveWait, Math.min(poll, Math.max(0, deadline - Date.now()))));
  } while (Date.now() < deadline);
  throw new Error(`timed out after ${timeout} ms waiting for ${condition}; last state: ${JSON.stringify(last)}`);
}

const options = parseArgs(process.argv.slice(2));
try {
  const info = await connection(resolve(options.project));
  let result;
  if (options.command === 'status') {
    result = await requestBridge(info, { target: 'bridge', method: 'status', args: [] }, options.timeout);
  } else if (options.command === 'wait') {
    result = await waitFor(info, options.target, options.timeout, options.poll);
  } else if (options.command === 'request') {
    if (!['scene', 'asset-db', 'scene-script'].includes(options.target)) usage('invalid request target');
    if (!options.method) usage('request method is required');
    let args;
    try { args = JSON.parse(options.argsJson); } catch { usage('args-json must be valid JSON'); }
    if (!Array.isArray(args)) usage('args-json must be a JSON array');
    result = await requestBridge(info, { target: options.target, method: options.method, args }, options.timeout);
  } else {
    usage('command must be status, wait, or request');
  }
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
}
