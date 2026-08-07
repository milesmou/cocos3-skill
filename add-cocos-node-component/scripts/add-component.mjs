#!/usr/bin/env node

import { randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, isAbsolute, relative, resolve, sep } from 'node:path';

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const DEFAULT_SPRITE_FRAME_UUID = '7d8f9b89-4fd1-4c9f-a3ab-38ec7cded7ca@f9941';
const RESERVED_PROPERTIES = new Set(['__type__', '_name', '_objFlags', '__editorExtras__', 'node', '_enabled', '__prefab', '_id']);

function usage(message) {
  if (message) console.error(`Error: ${message}\n`);
  console.error('Usage: node add-component.mjs --project <dir> --prefab <path> --node <node/path> (--component <type> | --script <assets-relative-path>) [--properties <json>]');
  process.exit(message ? 1 : 0);
}

function parseArgs(argv) {
  const options = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--list-components') options.listComponents = true;
    else if (arg === '--help' || arg === '-h') usage();
    else if (['--project', '--prefab', '--node', '--component', '--script', '--properties'].includes(arg)) {
      const value = argv[++index];
      if (!value || value.startsWith('--')) usage(`${arg} requires a value`);
      options[arg.slice(2)] = value;
    } else usage(`unknown argument: ${arg}`);
  }
  if (options.listComponents) return options;
  for (const key of ['project', 'prefab', 'node']) if (!options[key]) usage(`--${key} is required`);
  if (Boolean(options.component) === Boolean(options.script)) usage('specify exactly one of --component or --script');
  return options;
}

function isWithin(parent, child) {
  const rel = relative(parent, child);
  return rel !== '..' && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function fileId() {
  return randomBytes(16).toString('base64').replace(/=/g, '').slice(0, 22);
}

function defaultSpriteFrame() {
  return { __uuid__: DEFAULT_SPRITE_FRAME_UUID, __expectedType__: 'cc.SpriteFrame' };
}

function compressUuid(uuid) {
  const hex = uuid.replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(hex)) throw new Error(`invalid script UUID: ${uuid}`);
  let output = hex.slice(0, 5);
  for (let index = 5; index < hex.length; index += 3) {
    const value = Number.parseInt(hex.slice(index, index + 3), 16);
    output += BASE64[(value >> 6) & 63] + BASE64[value & 63];
  }
  return output;
}

function childNodeIds(objects, node) {
  if (!Array.isArray(node._children)) throw new Error(`node ${node._name} has invalid _children data`);
  return node._children.map((entry) => {
    const id = entry?.__id__;
    if (!Number.isInteger(id) || objects[id]?.__type__ !== 'cc.Node') throw new Error(`node ${node._name} contains an invalid child reference`);
    return id;
  });
}

function findNode(objects, rootId, nodePath) {
  let currentId = rootId;
  const parts = nodePath.replaceAll('\\', '/').split('/').filter(Boolean);
  if (parts[0] === objects[rootId]._name) parts.shift();
  for (const part of parts) {
    const matches = childNodeIds(objects, objects[currentId]).filter((id) => objects[id]._name === part);
    if (matches.length === 0) throw new Error(`node path not found at: ${part}`);
    if (matches.length > 1) throw new Error(`node path is ambiguous at: ${part}`);
    currentId = matches[0];
  }
  return currentId;
}

function spriteComponent(nodeId, prefabInfoId) {
  return {
    __type__: 'cc.Sprite', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true,
    __prefab: { __id__: prefabInfoId }, _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
    _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 }, _spriteFrame: defaultSpriteFrame(), _type: 0, _fillType: 0,
    _sizeMode: 1, _fillCenter: { __type__: 'cc.Vec2', x: 0, y: 0 }, _fillStart: 0, _fillRange: 0,
    _isTrimmedMode: true, _useGrayscale: false, _atlas: null, _id: ''
  };
}

function color(r, g, b, a = 255) {
  return { __type__: 'cc.Color', r, g, b, a };
}

function labelComponent(nodeId, prefabInfoId) {
  return {
    __type__: 'cc.Label', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true,
    __prefab: { __id__: prefabInfoId }, _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4,
    _color: color(255, 255, 255), _string: 'label', _horizontalAlign: 1, _verticalAlign: 1, _actualFontSize: 0,
    _fontSize: 40, _fontFamily: 'Arial', _lineHeight: 40, _overflow: 0, _enableWrapText: true, _font: null,
    _isSystemFontUsed: true, _spacingX: 0, _isItalic: false, _isBold: false, _isUnderline: false, _underlineHeight: 2,
    _cacheMode: 0, _enableOutline: false, _outlineColor: color(0, 0, 0), _outlineWidth: 2, _enableShadow: false,
    _shadowColor: color(0, 0, 0), _shadowOffset: { __type__: 'cc.Vec2', x: 2, y: 2 }, _shadowBlur: 2, _id: ''
  };
}

function buttonComponent(nodeId, prefabInfoId) {
  return {
    __type__: 'cc.Button', _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true,
    __prefab: { __id__: prefabInfoId }, clickEvents: [], _interactable: true, _transition: 0,
    _normalColor: color(255, 255, 255), _hoverColor: color(211, 211, 211), _pressedColor: color(255, 255, 255),
    _disabledColor: color(124, 124, 124), _normalSprite: null, _hoverSprite: null, _pressedSprite: null,
    _disabledSprite: null, _duration: 0.1, _zoomScale: 1.2, _target: null, _id: ''
  };
}

function baseComponent(type, nodeId, prefabInfoId, fields = {}) {
  return { __type__: type, _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true, __prefab: { __id__: prefabInfoId }, ...fields, _id: '' };
}

function graphicsComponent(nodeId, prefabInfoId) {
  return baseComponent('cc.Graphics', nodeId, prefabInfoId, {
    _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 4, _color: color(255, 255, 255), _lineWidth: 1,
    _strokeColor: color(0, 0, 0), _lineJoin: 2, _lineCap: 0, _fillColor: color(255, 255, 255), _miterLimit: 10
  });
}

const SIMPLE_FACTORIES = {
  'cc.SpriteRenderer': (n, p) => baseComponent('cc.SpriteRenderer', n, p, { _materials: [], _visFlags: 0, _spriteFrame: defaultSpriteFrame(), _mode: 0, _color: color(255, 255, 255), _flipX: false, _flipY: false, _size: { __type__: 'cc.Vec2', x: 0, y: 0 } }),
  'cc.Graphics': graphicsComponent,
  'cc.Mask': (n, p) => baseComponent('cc.Mask', n, p, { _type: 0, _inverted: false, _segments: 64, _alphaThreshold: 0.1 }),
  'cc.ParticleSystem2D': (n, p) => baseComponent('cc.ParticleSystem2D', n, p, {
    _customMaterial: null, _srcBlendFactor: 2, _dstBlendFactor: 1, _color: color(255, 255, 255), duration: -1,
    emissionRate: 10, life: 1, lifeVar: 0, angle: 90, angleVar: 20, startSize: 50, startSizeVar: 0, endSize: 0,
    endSizeVar: 0, startSpin: 0, startSpinVar: 0, endSpin: 0, endSpinVar: 0, sourcePos: { __type__: 'cc.Vec2', x: 0, y: 0 },
    posVar: { __type__: 'cc.Vec2', x: 0, y: 0 }, emitterMode: 0, gravity: { __type__: 'cc.Vec2', x: 0, y: 0 },
    speed: 180, speedVar: 50, tangentialAccel: 80, tangentialAccelVar: 0, radialAccel: 0, radialAccelVar: 0,
    rotationIsDir: false, startRadius: 0, startRadiusVar: 0, endRadius: 0, endRadiusVar: 0, rotatePerS: 0,
    rotatePerSVar: 0, playOnLoad: true, autoRemoveOnFinish: false, _preview: true, preview: true, _custom: true,
    _file: null, _spriteFrame: null, _totalParticles: 150, _startColor: color(255, 255, 255), _startColorVar: color(0, 0, 0, 0),
    _endColor: color(255, 255, 255, 0), _endColorVar: color(0, 0, 0, 0), _positionType: 0
  }),
  'cc.TiledMap': (n, p) => baseComponent('cc.TiledMap', n, p, { _tmxFile: null, _enableCulling: true, cleanupImageCache: true }),
  'cc.Canvas': (n, p) => baseComponent('cc.Canvas', n, p, { _cameraComponent: null, _alignCanvasWithScreen: true }),
  'cc.EditBox': (n, p) => baseComponent('cc.EditBox', n, p, { editingDidBegan: [], textChanged: [], editingDidEnded: [], editingReturn: [], _textLabel: null, _placeholderLabel: null, _returnType: 0, _string: '', _tabIndex: 0, _backgroundImage: null, _inputFlag: 5, _inputMode: 6, _maxLength: 20 }),
  'cc.Layout': (n, p) => baseComponent('cc.Layout', n, p, { _resizeMode: 0, _layoutType: 0, _cellSize: { __type__: 'cc.Size', width: 40, height: 40 }, _startAxis: 0, _paddingLeft: 0, _paddingRight: 0, _paddingTop: 0, _paddingBottom: 0, _spacingX: 0, _spacingY: 0, _verticalDirection: 1, _horizontalDirection: 0, _constraint: 0, _constraintNum: 2, _affectedByScale: false, _isAlign: false }),
  'cc.PageView': (n, p) => baseComponent('cc.PageView', n, p, { bounceDuration: 1, brake: 0.5, elastic: true, inertia: true, horizontal: true, vertical: false, cancelInnerEvents: true, scrollEvents: [], _content: null, _horizontalScrollBar: null, _verticalScrollBar: null, autoPageTurningThreshold: 100, pageTurningSpeed: 0.3, pageEvents: [], _sizeMode: 0, _direction: 0, _scrollThreshold: 0.5, _pageTurningEventTiming: 0.1, _indicator: null }),
  'cc.PageViewIndicator': (n, p) => baseComponent('cc.PageViewIndicator', n, p, { _spriteFrame: null, _direction: 0, _cellSize: { __type__: 'cc.Size', width: 20, height: 20 }, _spacing: 0, _pageView: null }),
  'cc.ProgressBar': (n, p) => baseComponent('cc.ProgressBar', n, p, { _barSprite: null, _mode: 0, _totalLength: 100, _progress: 0.5, _reverse: false }),
  'cc.RichText': (n, p) => baseComponent('cc.RichText', n, p, { _lineHeight: 40, _string: '<color=#ffffff>RichText</color>', _horizontalAlign: 0, _verticalAlign: 0, _fontSize: 40, _fontColor: color(255, 255, 255), _maxWidth: 0, _fontFamily: 'Arial', _font: null, _isSystemFontUsed: true, _userDefinedFont: null, _cacheMode: 0, _imageAtlas: null, _handleTouchEvent: true }),
  'cc.ScrollView': (n, p) => baseComponent('cc.ScrollView', n, p, { bounceDuration: 0.23, brake: 0.75, elastic: true, inertia: true, horizontal: true, vertical: true, cancelInnerEvents: true, scrollEvents: [], _content: null, _horizontalScrollBar: null, _verticalScrollBar: null }),
  'cc.ScrollBar': (n, p) => baseComponent('cc.ScrollBar', n, p, { _handle: null, _direction: 0, _enableAutoHide: true, _autoHideTime: 1 }),
  'cc.Slider': (n, p) => baseComponent('cc.Slider', n, p, { slideEvents: [], _handle: null, _direction: 0, _progress: 0.5 }),
  'cc.Toggle': (n, p) => baseComponent('cc.Toggle', n, p, { clickEvents: [], _interactable: true, _transition: 0, _normalColor: color(255, 255, 255), _hoverColor: color(211, 211, 211), _pressedColor: color(255, 255, 255), _disabledColor: color(124, 124, 124), _normalSprite: null, _hoverSprite: null, _pressedSprite: null, _disabledSprite: null, _duration: 0.1, _zoomScale: 1.2, _target: null, checkEvents: [], _isChecked: true, _checkMark: null }),
  'cc.ToggleContainer': (n, p) => baseComponent('cc.ToggleContainer', n, p, { _allowSwitchOff: false, checkEvents: [] }),
  'cc.VideoPlayer': (n, p) => baseComponent('cc.VideoPlayer', n, p, { _resourceType: 0, _remoteURL: '', _clip: null, _playOnAwake: true, _volume: 1, _mute: false, _playbackRate: 1, _loop: false, _fullScreenOnAwake: false, _stayOnBottom: false, _keepAspectRatio: true, videoPlayerEvent: [] }),
  'cc.WebView': (n, p) => baseComponent('cc.WebView', n, p, { _url: 'https://cocos.com', webviewEvents: [] }),
  'cc.Widget': (n, p) => baseComponent('cc.Widget', n, p, { _alignFlags: 0, _target: null, _left: 0, _right: 0, _top: 0, _bottom: 0, _horizontalCenter: 0, _verticalCenter: 0, _isAbsLeft: true, _isAbsRight: true, _isAbsTop: true, _isAbsBottom: true, _isAbsHorizontalCenter: true, _isAbsVerticalCenter: true, _originalWidth: 0, _originalHeight: 0, _alignMode: 2, _lockFlags: 0 })
};

const BUILT_IN_TYPES = new Map([
  ['sprite', 'cc.Sprite'], ['label', 'cc.Label'], ['button', 'cc.Button'], ['spriterenderer', 'cc.SpriteRenderer'],
  ['graphics', 'cc.Graphics'], ['mask', 'cc.Mask'], ['particle2d', 'cc.ParticleSystem2D'], ['particlesystem2d', 'cc.ParticleSystem2D'],
  ['tiledmap', 'cc.TiledMap'], ['canvas', 'cc.Canvas'], ['editbox', 'cc.EditBox'], ['layout', 'cc.Layout'],
  ['pageview', 'cc.PageView'], ['pageviewindicator', 'cc.PageViewIndicator'], ['progressbar', 'cc.ProgressBar'],
  ['richtext', 'cc.RichText'], ['scrollview', 'cc.ScrollView'], ['scrollbar', 'cc.ScrollBar'], ['slider', 'cc.Slider'],
  ['toggle', 'cc.Toggle'], ['togglegroup', 'cc.ToggleContainer'], ['togglecontainer', 'cc.ToggleContainer'],
  ['videoplayer', 'cc.VideoPlayer'], ['webview', 'cc.WebView'], ['widget', 'cc.Widget']
]);

const options = parseArgs(process.argv.slice(2));
if (options.listComponents) {
  console.log([...new Set(BUILT_IN_TYPES.values())].map((type) => type.slice(3)).join('\n'));
  process.exit(0);
}
const projectDir = resolve(options.project);
let projectPackage;
try {
  projectPackage = JSON.parse(await readFile(resolve(projectDir, 'package.json'), 'utf8'));
} catch {
  usage(`cannot read a valid package.json in ${projectDir}`);
}
const creatorVersion = String(projectPackage?.creator?.version ?? '');
if (!/^3\.8(?:\.|$)/.test(creatorVersion)) usage(`expected Cocos Creator 3.8, found ${creatorVersion || 'no creator version'}`);

const assetsDir = resolve(projectDir, 'assets');
let prefabAssetPath = options.prefab.replaceAll('\\', '/');
if (prefabAssetPath.startsWith('assets/')) prefabAssetPath = prefabAssetPath.slice('assets/'.length);
if (extname(prefabAssetPath).toLowerCase() !== '.prefab') prefabAssetPath += '.prefab';
const prefabPath = resolve(assetsDir, prefabAssetPath);
if (!isWithin(assetsDir, prefabPath) || prefabPath === assetsDir) usage('--prefab must resolve inside the project assets directory');

let objects;
try {
  objects = JSON.parse(await readFile(prefabPath, 'utf8'));
} catch {
  usage(`cannot read a valid Prefab: ${prefabPath}`);
}
if (!Array.isArray(objects) || objects[0]?.__type__ !== 'cc.Prefab') usage('unsupported Prefab object table');
const rootId = objects[0]?.data?.__id__;
if (!Number.isInteger(rootId) || objects[rootId]?.__type__ !== 'cc.Node') usage('Prefab has an invalid root node reference');

let nodeId;
try {
  nodeId = findNode(objects, rootId, options.node);
} catch (error) {
  usage(error.message);
}
const node = objects[nodeId];
if (!Array.isArray(node._components)) usage(`node ${node._name} has invalid _components data`);

let componentType;
let customProperties = {};
if (options.component) {
  const requestedType = options.component.toLowerCase().replace(/^cc\./, '');
  if (!BUILT_IN_TYPES.has(requestedType)) usage(`supported built-in components: ${[...BUILT_IN_TYPES.keys()].join(', ')}`);
  componentType = BUILT_IN_TYPES.get(requestedType);
} else {
  let scriptAssetPath = options.script.replaceAll('\\', '/');
  if (scriptAssetPath.startsWith('assets/')) scriptAssetPath = scriptAssetPath.slice('assets/'.length);
  const scriptPath = resolve(assetsDir, scriptAssetPath);
  if (!isWithin(assetsDir, scriptPath) || scriptPath === assetsDir) usage('--script must resolve inside the project assets directory');
  let scriptMeta;
  try {
    scriptMeta = JSON.parse(await readFile(`${scriptPath}.meta`, 'utf8'));
  } catch {
    usage(`cannot read script metadata: ${scriptPath}.meta`);
  }
  try {
    componentType = compressUuid(scriptMeta.uuid);
  } catch (error) {
    usage(error.message);
  }
}

if (options.properties) {
  try {
    customProperties = JSON.parse(options.properties);
  } catch {
    usage('--properties must be a valid JSON object');
  }
  if (!customProperties || Array.isArray(customProperties) || typeof customProperties !== 'object') usage('--properties must be a JSON object');
  for (const key of Object.keys(customProperties)) if (RESERVED_PROPERTIES.has(key)) usage(`--properties cannot override reserved field: ${key}`);
}

const existingTypes = node._components.map((entry) => objects[entry?.__id__]?.__type__);
if (existingTypes.includes(componentType)) usage(`node ${node._name} already has component ${componentType}; reuse the existing component instead of adding a duplicate`);

const componentId = objects.length;
const prefabInfoId = componentId + 1;
const builtInFactories = {
  'cc.Sprite': spriteComponent,
  'cc.Label': labelComponent,
  'cc.Button': buttonComponent,
  ...SIMPLE_FACTORIES
};
const component = builtInFactories[componentType]
  ? { ...builtInFactories[componentType](nodeId, prefabInfoId), ...customProperties, _id: '' }
  : {
      __type__: componentType, _name: '', _objFlags: 0, __editorExtras__: {}, node: { __id__: nodeId }, _enabled: true,
      __prefab: { __id__: prefabInfoId }, ...customProperties, _id: ''
    };
objects.push(component, { __type__: 'cc.CompPrefabInfo', fileId: fileId() });
node._components.push({ __id__: componentId });

await writeFile(prefabPath, `${JSON.stringify(objects, null, 2)}\n`, 'utf8');
console.log(prefabPath);
console.log(`Added ${componentType} to ${node._name}`);
