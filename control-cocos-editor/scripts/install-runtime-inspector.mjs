#!/usr/bin/env node

import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/** 标识已安装运行时采集脚本的幂等注释。 */
const INSERT_MARKER = '<!-- cocos3-codex-runtime-inspector -->';
/** 注入 Creator 官方预览模板的只读采集脚本标签。 */
const INSERT_BLOCK = `        ${INSERT_MARKER}\n        <script src="./runtime-node-inspector.js"></script>\n`;

function usage(message) {
  if (message) process.stderr.write(`Error: ${message}\n\n`);
  process.stderr.write('Usage: node install-runtime-inspector.mjs --project <dir>\n');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index++) {
    if (argv[index] === '--project') options.project = argv[++index];
    else if (argv[index] === '--help' || argv[index] === '-h') usage();
    else usage(`unknown argument: ${argv[index]}`);
  }
  if (!options.project) usage('--project is required');
  return options;
}

async function bridgeStatus(project) {
  const connectionPath = resolve(project, 'temp', 'cocos3-codex-bridge.json');
  let connection;
  try {
    connection = JSON.parse(await readFile(connectionPath, 'utf8'));
  } catch {
    throw new Error(`bridge connection file not found: ${connectionPath}; keep Creator open and enable cocos3-codex-bridge`);
  }
  const response = await fetch(`http://${connection.host}:${connection.port}/request`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ token: connection.token, target: 'bridge', method: 'status', args: [] })
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) throw new Error(payload.error || `bridge returned HTTP ${response.status}`);
  return payload.result;
}

const options = parseArgs(process.argv.slice(2));
const project = resolve(options.project);
const status = await bridgeStatus(project);
if (!/^3\.8(?:\.|$)/.test(String(status.creator || ''))) {
  throw new Error(`expected Cocos Creator 3.8.x, found ${status.creator || '<unknown>'}`);
}

const templateDirectory = resolve(project, 'preview-template');
const templatePath = resolve(templateDirectory, 'index.ejs');
const inspectorTarget = resolve(templateDirectory, 'runtime-node-inspector.js');
await mkdir(templateDirectory, { recursive: true });

let template;
let createdTemplate = false;
try {
  template = await readFile(templatePath, 'utf8');
} catch {
  const builtInTemplate = resolve(
    status.editorDirectory,
    'resources',
    'app.asar.unpacked',
    'builtin',
    'preview',
    'static',
    'views',
    'index.ejs',
  );
  template = await readFile(builtInTemplate, 'utf8');
  createdTemplate = true;
}

let updatedTemplate = false;
if (!template.includes(INSERT_MARKER)) {
  if (!template.includes('</body>')) throw new Error(`preview template has no </body> tag: ${templatePath}`);
  template = template.replace('</body>', `${INSERT_BLOCK}    </body>`);
  await writeFile(templatePath, template.replaceAll('\r\n', '\n'), 'utf8');
  updatedTemplate = true;
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const inspectorSource = resolve(scriptDirectory, '..', 'assets', 'runtime-node-inspector.js');
await copyFile(inspectorSource, inspectorTarget);

process.stdout.write(`${JSON.stringify({
  project,
  templatePath,
  inspectorTarget,
  createdTemplate,
  updatedTemplate,
  next: 'refresh the normal Creator Web preview, then run cocos-editor.mjs runtime-stats'
}, null, 2)}\n`);
