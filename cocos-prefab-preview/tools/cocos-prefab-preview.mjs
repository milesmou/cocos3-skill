import fs from 'node:fs';
import path from 'node:path';

const args = process.argv.slice(2);
if (args[0] === '--cleanup') {
  cleanupCopiedAssets(args[1]);
  process.exit(0);
}

const [projectRootArg, prefabArg, outArg, scaleArg] = args;
if (!projectRootArg || !prefabArg || !outArg) {
  throw new Error('Usage: node tools/cocos-prefab-preview.mjs <projectRoot> <prefab> <outHtml> [scale]\n       node tools/cocos-prefab-preview.mjs --cleanup <outHtml>');
}

const projectRoot = path.resolve(projectRootArg);
const prefabPath = path.resolve(prefabArg);
const outPath = path.resolve(outArg);
const previewScale = Number.isFinite(Number(scaleArg)) && Number(scaleArg) > 0 ? Number(scaleArg) : 1;
let data = JSON.parse(fs.readFileSync(prefabPath, 'utf8'));
const copiedAssets = [];

function manifestPathFor(htmlPath) {
  return `${path.resolve(htmlPath)}.assets.json`;
}

function cleanupCopiedAssets(htmlPath) {
  if (!htmlPath) throw new Error('Usage: node tools/cocos-prefab-preview.mjs --cleanup <outHtml>');
  const manifestPath = manifestPathFor(htmlPath);
  if (!fs.existsSync(manifestPath)) {
    console.log(`No copied asset manifest found: ${manifestPath}`);
    return;
  }
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const root = path.resolve(manifest.outputDir || path.dirname(path.resolve(htmlPath)));
  for (const file of manifest.files || []) {
    const target = path.resolve(file);
    if (!target.startsWith(root + path.sep)) continue;
    if (fs.existsSync(target)) fs.unlinkSync(target);
  }
  for (const dir of (manifest.dirs || []).sort((a, b) => b.length - a.length)) {
    const target = path.resolve(dir);
    if (!target.startsWith(root + path.sep)) continue;
    try {
      fs.rmdirSync(target);
    } catch {
      // Directory is not empty; leave user files untouched.
    }
  }
  fs.unlinkSync(manifestPath);
  console.log(`Cleaned copied preview assets for ${path.resolve(htmlPath)}`);
}

function walkFiles(dir, predicate, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walkFiles(full, predicate, out);
    else if (predicate(full)) out.push(full);
  }
  return out;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function deepClone(value) {
  return JSON.parse(JSON.stringify(value));
}

function relativeAssetUrl(file) {
  const assetsDir = path.join(path.dirname(outPath), `${path.basename(outPath)}.assets`);
  fs.mkdirSync(assetsDir, { recursive: true });
  const parsed = path.parse(file);
  const safeName = `${parsed.name}-${Buffer.from(file).toString('base64url').slice(0, 10)}${parsed.ext}`;
  const dest = path.join(assetsDir, safeName);
  if (!fs.existsSync(dest)) fs.copyFileSync(file, dest);
  copiedAssets.push(dest);
  return `${encodeURIComponent(path.basename(outPath))}.assets/${encodeURIComponent(safeName)}`;
}

function spriteFrameMeta(uuidWithSuffix) {
  if (!uuidWithSuffix) return null;
  const uuid = uuidWithSuffix.split('@')[0];
  const suffix = uuidWithSuffix.includes('@') ? uuidWithSuffix.split('@')[1] : 'f9941';
  const file = path.join(projectRoot, 'library', uuid.slice(0, 2), `${uuid}@${suffix}.json`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8')).content ?? null;
  } catch {
    return null;
  }
}

const uuidToImage = new Map();
const uuidToPrefab = new Map();
const uuidToAssetName = new Map();
for (const metaPath of walkFiles(path.join(projectRoot, 'assets'), p => p.endsWith('.png.meta'))) {
  try {
    const meta = readJson(metaPath);
    if (meta.uuid) uuidToImage.set(meta.uuid, metaPath.slice(0, -5));
  } catch {
    // Ignore malformed or transient editor metadata.
  }
}

for (const metaPath of walkFiles(path.join(projectRoot, 'assets'), p => p.endsWith('.skel.meta') || p.endsWith('.json.meta'))) {
  try {
    const meta = readJson(metaPath);
    if (meta.uuid) uuidToAssetName.set(meta.uuid, path.basename(metaPath.slice(0, -5)));
  } catch {
    // Ignore malformed or transient editor metadata.
  }
}

for (const metaPath of walkFiles(path.join(projectRoot, 'assets'), p => p.endsWith('.prefab.meta'))) {
  try {
    const meta = readJson(metaPath);
    if (meta.uuid) uuidToPrefab.set(meta.uuid, metaPath.slice(0, -5));
  } catch {
    // Ignore malformed or transient editor metadata.
  }
}

function remapRefs(value, idMap) {
  if (!value || typeof value !== 'object') return value;
  if (Object.prototype.hasOwnProperty.call(value, '__id__')) {
    return { ...value, __id__: idMap.get(value.__id__) ?? value.__id__ };
  }
  if (Array.isArray(value)) return value.map(item => remapRefs(item, idMap));
  const out = {};
  for (const [key, child] of Object.entries(value)) out[key] = remapRefs(child, idMap);
  return out;
}

function setPath(target, pathParts, value) {
  if (!target || !pathParts?.length) return;
  let cursor = target;
  for (let i = 0; i < pathParts.length - 1; i++) {
    const part = pathParts[i];
    if (cursor[part] == null || typeof cursor[part] !== 'object') cursor[part] = {};
    cursor = cursor[part];
  }
  cursor[pathParts[pathParts.length - 1]] = deepClone(value);
}

function buildFileIdTargetMap(prefabData, idMap) {
  const result = new Map();
  for (let i = 0; i < prefabData.length; i++) {
    const item = prefabData[i];
    if (item?.__type__ === 'cc.PrefabInfo' && item.fileId && item.root?.__id__ != null) {
      result.set(item.fileId, idMap.get(item.root.__id__) ?? item.root.__id__);
    } else if (item?.__type__ === 'cc.CompPrefabInfo' && item.fileId) {
      const newInfoId = idMap.get(i);
      const ownerId = data.findIndex(obj => obj?.__prefab?.__id__ === newInfoId || obj?._prefab?.__id__ === newInfoId);
      if (ownerId >= 0) result.set(item.fileId, ownerId);
    }
  }
  return result;
}

function applyPrefabInstanceOverrides(hostData, instance, fileIdTargets) {
  for (const ref of instance.propertyOverrides || []) {
    const override = hostData[ref.__id__];
    const localId = hostData[override?.targetInfo?.__id__]?.localID?.[0];
    const targetId = fileIdTargets.get(localId);
    if (targetId == null || !override?.propertyPath) continue;
    setPath(hostData[targetId], override.propertyPath, override.value);
  }
}

function expandNestedPrefabs(hostData, sourcePath, depth = 0, stack = new Set()) {
  if (depth > 6) return hostData;
  let changed = false;
  for (let i = 0; i < hostData.length; i++) {
    const info = hostData[i];
    const prefabUuid = info?.asset?.__uuid__;
    const instanceId = info?.instance?.__id__;
    const rootId = info?.root?.__id__;
    if (info?.__type__ !== 'cc.PrefabInfo' || info.__previewExpanded || !prefabUuid || instanceId == null || rootId == null) continue;
    const nestedPath = uuidToPrefab.get(prefabUuid);
    if (!nestedPath || stack.has(nestedPath)) continue;

    const nestedRaw = readJson(nestedPath);
    const nestedData = expandNestedPrefabs(nestedRaw, nestedPath, depth + 1, new Set([...stack, sourcePath]));
    const nestedRootId = nestedData[0]?.data?.__id__ ?? 1;
    const hostRoot = hostData[rootId] || {};
    const idMap = new Map();
    let nextId = hostData.length;
    for (let j = 0; j < nestedData.length; j++) {
      if (j === 0) continue;
      idMap.set(j, j === nestedRootId ? rootId : nextId++);
    }

    const cloned = [];
    for (let j = 1; j < nestedData.length; j++) {
      const remapped = remapRefs(deepClone(nestedData[j]), idMap);
      if (j === nestedRootId) {
        remapped._parent = hostRoot._parent ?? remapped._parent ?? null;
        remapped._active = hostRoot._active ?? remapped._active;
        remapped._lpos = hostRoot._lpos ?? remapped._lpos;
        remapped._lrot = hostRoot._lrot ?? remapped._lrot;
        remapped._lscale = hostRoot._lscale ?? remapped._lscale;
        remapped._euler = hostRoot._euler ?? remapped._euler;
        hostData[rootId] = remapped;
      } else {
        cloned.push(remapped);
      }
    }
    hostData.push(...cloned);
    const fileIdTargets = buildFileIdTargetMap(nestedData, idMap);
    applyPrefabInstanceOverrides(hostData, hostData[instanceId], fileIdTargets);
    info.__previewExpanded = true;
    changed = true;
  }
  return changed ? expandNestedPrefabs(hostData, sourcePath, depth, stack) : hostData;
}

data = expandNestedPrefabs(data, prefabPath);

const nodeState = new Map();
for (let i = 0; i < data.length; i++) {
  const item = data[i];
  if (item?.__type__ === 'cc.Node') {
    nodeState.set(i, {
      id: i,
      name: item._name || `node-${i}`,
      active: item._active !== false,
      parent: item._parent?.__id__ ?? null,
      children: (item._children || []).map(ref => ref.__id__),
      x: item._lpos?.x ?? 0,
      y: item._lpos?.y ?? 0,
      sx: item._lscale?.x ?? 1,
      sy: item._lscale?.y ?? 1,
      angle: item._euler?.z ?? 0,
      w: 0,
      h: 0,
      ax: 0.5,
      ay: 0.5,
      sprite: null,
      label: null,
      spine: null,
      mask: false,
      color: { r: 255, g: 255, b: 255, a: 255 },
    });
  }
}

for (const item of data) {
  const nodeId = item?.node?.__id__;
  if (!nodeState.has(nodeId)) continue;
  const node = nodeState.get(nodeId);
  if (item.__type__ === 'cc.UITransform') {
    node.w = item._contentSize?.width ?? node.w;
    node.h = item._contentSize?.height ?? node.h;
    node.ax = item._anchorPoint?.x ?? node.ax;
    node.ay = item._anchorPoint?.y ?? node.ay;
  } else if (item.__type__ === 'cc.Sprite') {
    const uuid = item._spriteFrame?.__uuid__?.split('@')[0];
    node.sprite = uuid ? uuidToImage.get(uuid) ?? null : null;
    node.spriteUuid = item._spriteFrame?.__uuid__ ?? null;
    node.spriteFrame = spriteFrameMeta(node.spriteUuid);
    node.spriteType = item._type ?? 0;
    node.color = item._color ?? node.color;
  } else if (item.__type__ === 'cc.Label') {
    node.label = {
      text: item._string ?? '',
      size: item._fontSize ?? 24,
      color: item._color ?? { r: 255, g: 255, b: 255, a: 255 },
      align: item._horizontalAlign ?? 1,
      valign: item._verticalAlign ?? 1,
      lineHeight: item._lineHeight ?? item._fontSize ?? 24,
      outline: item._enableOutline ? {
        color: item._outlineColor ?? { r: 83, g: 31, b: 11, a: 255 },
        width: item._outlineWidth ?? 2,
      } : null,
      bold: item._isBold !== false,
    };
  } else if (item.__type__ === 'sp.Skeleton') {
    const skeletonUuid = item._skeletonData?.__uuid__ ?? null;
    node.spine = {
      assetName: uuidToAssetName.get(skeletonUuid) ?? '',
      skin: item.defaultSkin ?? '',
      animation: item.defaultAnimation ?? '',
      loop: item.loop === true,
      premultipliedAlpha: item._premultipliedAlpha === true,
    };
  } else if (item.__type__ === 'cc.Mask') {
    node.mask = item._enabled !== false;
  }
}

function worldOf(id) {
  const node = nodeState.get(id);
  if (!node) return null;
  if (node.world) return node.world;
  const parent = worldOf(node.parent);
  const psx = parent?.sx ?? 1;
  const psy = parent?.sy ?? 1;
  node.world = {
    x: (parent?.x ?? 0) + node.x * psx,
    y: (parent?.y ?? 0) + node.y * psy,
    sx: (parent?.sx ?? 1) * node.sx,
    sy: (parent?.sy ?? 1) * node.sy,
    active: node.active && (parent?.active ?? true),
  };
  return node.world;
}

function rectOf(node, world = worldOf(node.id)) {
  const w = Math.abs(node.w * (world?.sx ?? 1));
  const h = Math.abs(node.h * (world?.sy ?? 1));
  return {
    left: (world?.x ?? 0) - node.ax * w,
    right: (world?.x ?? 0) + (1 - node.ax) * w,
    bottom: (world?.y ?? 0) - node.ay * h,
    top: (world?.y ?? 0) + (1 - node.ay) * h,
    rw: w,
    rh: h,
  };
}

function intersectRect(a, b) {
  const rect = {
    left: Math.max(a.left, b.left),
    right: Math.min(a.right, b.right),
    bottom: Math.max(a.bottom, b.bottom),
    top: Math.min(a.top, b.top),
  };
  return rect.right > rect.left && rect.top > rect.bottom ? rect : null;
}

function clipForNode(node) {
  let clip = null;
  let parentId = node.parent;
  while (parentId != null) {
    const parent = nodeState.get(parentId);
    if (!parent) break;
    if (parent.mask && parent.w > 0 && parent.h > 0) {
      const maskRect = rectOf(parent);
      clip = clip ? intersectRect(clip, maskRect) : maskRect;
      if (!clip) return null;
    }
    parentId = parent.parent;
  }
  return clip;
}

const renderNodes = [];
for (const node of nodeState.values()) {
  const world = worldOf(node.id);
  if (!world?.active || (node.w <= 0 && node.h <= 0)) continue;
  if (!node.sprite && !node.label && !node.spine) continue;
  const ownRect = rectOf(node, world);
  const ancestorClip = clipForNode(node);
  const visibleRect = ancestorClip ? intersectRect(ownRect, ancestorClip) : ownRect;
  if (!visibleRect) continue;
  renderNodes.push({
    ...node,
    wx: world.x,
    wy: world.y,
    wsx: world.sx,
    wsy: world.sy,
    rw: ownRect.rw,
    rh: ownRect.rh,
    left: ownRect.left,
    right: ownRect.right,
    bottom: ownRect.bottom,
    top: ownRect.top,
    visibleLeft: visibleRect.left,
    visibleRight: visibleRect.right,
    visibleBottom: visibleRect.bottom,
    visibleTop: visibleRect.top,
  });
}

const pad = 40;
const bounds = renderNodes.reduce((acc, node) => ({
  minX: Math.min(acc.minX, node.visibleLeft),
  maxX: Math.max(acc.maxX, node.visibleRight),
  minY: Math.min(acc.minY, node.visibleBottom),
  maxY: Math.max(acc.maxY, node.visibleTop),
}), { minX: 0, maxX: 0, minY: 0, maxY: 0 });
const width = Math.ceil(bounds.maxX - bounds.minX + pad * 2);
const height = Math.ceil(bounds.maxY - bounds.minY + pad * 2);
const scaledWidth = Math.ceil(width * previewScale);
const scaledHeight = Math.ceil(height * previewScale);

function rgba(c) {
  const alpha = (c.a ?? 255) / 255;
  return `rgba(${c.r ?? 255},${c.g ?? 255},${c.b ?? 255},${alpha})`;
}

function textShadow(outline) {
  if (!outline) return 'none';
  const color = rgba(outline.color);
  const width = Math.max(1, outline.width ?? 1);
  const parts = [];
  for (let x = -width; x <= width; x++) {
    for (let y = -width; y <= width; y++) {
      if (x === 0 && y === 0) continue;
      if ((x * x + y * y) <= width * width + 0.5) parts.push(`${x}px ${y}px 0 ${color}`);
    }
  }
  return parts.join(', ');
}

function esc(value) {
  return String(value).replace(/[&<>"']/g, ch => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

const body = renderNodes.map((node, index) => {
  const left = node.left - bounds.minX + pad;
  const top = bounds.maxY - node.top + pad;
  const title = esc(`${node.name} #${node.id}`);
  const clipStyle = node.visibleLeft !== node.left || node.visibleRight !== node.right || node.visibleBottom !== node.bottom || node.visibleTop !== node.top
    ? `clip-path:inset(${node.top - node.visibleTop}px ${node.right - node.visibleRight}px ${node.visibleBottom - node.bottom}px ${node.visibleLeft - node.left}px);`
    : '';
  if (node.sprite) {
    const src = relativeAssetUrl(node.sprite);
    const capInsets = node.spriteFrame?.capInsets || [];
    if (node.spriteType === 1 && capInsets.some(v => v > 0)) {
      const [capLeft, capTop, capRight, capBottom] = capInsets;
      return `<div class="node sprite sliced" title="${title}" style="z-index:${index};left:${left}px;top:${top}px;width:${node.rw}px;height:${node.rh}px;opacity:${(node.color.a ?? 255) / 255};${clipStyle}border-style:solid;border-width:${capTop}px ${capRight}px ${capBottom}px ${capLeft}px;border-image-source:url('${src}');border-image-slice:${capTop} ${capRight} ${capBottom} ${capLeft} fill;border-image-width:${capTop}px ${capRight}px ${capBottom}px ${capLeft}px;border-image-repeat:stretch;"></div>`;
    }
    return `<img class="node sprite" title="${title}" src="${src}" style="z-index:${index};left:${left}px;top:${top}px;width:${node.rw}px;height:${node.rh}px;opacity:${(node.color.a ?? 255) / 255};${clipStyle}">`;
  }
  if (node.spine) {
    const lines = [
      `Spine: ${node.name}`,
      node.spine.animation ? `anim: ${node.spine.animation}${node.spine.loop ? ' loop' : ''}` : 'anim: <empty>',
      node.spine.skin ? `skin: ${node.spine.skin}` : null,
      node.spine.assetName ? `asset: ${node.spine.assetName}` : 'asset: <missing>',
    ].filter(Boolean).map(esc);
    return `<div class="node spine-placeholder" title="${title}" style="z-index:${index};left:${left}px;top:${top}px;width:${node.rw}px;height:${node.rh}px;${clipStyle}"><div>${lines.join('</div><div>')}</div></div>`;
  }
  const justify = ['flex-start', 'center', 'flex-end'][node.label.align] ?? 'center';
  const textAlign = ['left', 'center', 'right'][node.label.align] ?? 'center';
  const alignItems = ['flex-start', 'center', 'flex-end'][node.label.valign] ?? 'center';
  const fontScale = Math.max(0.01, (Math.abs(node.wsx ?? 1) + Math.abs(node.wsy ?? 1)) / 2);
  const fontSize = node.label.size * fontScale;
  const lineHeight = node.label.lineHeight * Math.abs(node.wsy ?? fontScale);
  const outline = node.label.outline ? { ...node.label.outline, width: node.label.outline.width * fontScale } : null;
  return `<div class="node label" title="${title}" style="z-index:${index};left:${left}px;top:${top}px;width:${node.rw}px;height:${node.rh}px;${clipStyle}color:${rgba(node.label.color)};font-size:${fontSize}px;line-height:${lineHeight}px;justify-content:${justify};align-items:${alignItems};text-align:${textAlign};font-weight:${node.label.bold ? 700 : 400};text-shadow:${textShadow(outline)};">${esc(node.label.text)}</div>`;
}).join('\n');

const missing = renderNodes
  .filter(node => node.spriteUuid && !node.sprite)
  .map(node => `<li>${esc(node.name)}: ${esc(node.spriteUuid)}</li>`)
  .join('\n');

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${esc(path.basename(prefabPath))} preview</title>
<style>
  html, body { margin: 0; min-height: 100%; background: #1f2430; font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif; }
  .wrap { padding: 24px; color: #dfe6f3; }
  .stage-scale { width: ${scaledWidth}px; height: ${scaledHeight}px; overflow: hidden; }
  .stage { position: relative; width: ${width}px; height: ${height}px; background: linear-gradient(135deg, #30394a, #202733); overflow: hidden; box-shadow: 0 18px 60px rgba(0,0,0,.35); }
  .stage { transform: scale(${previewScale}); transform-origin: 0 0; }
  .node { position: absolute; box-sizing: border-box; transform-origin: 50% 50%; }
  .sprite { object-fit: fill; user-select: none; pointer-events: auto; }
  .sliced { background: transparent; }
  .label { display: flex; white-space: pre; }
  .spine-placeholder { display: flex; align-items: center; justify-content: center; overflow: hidden; padding: 6px; color: #6b4222; font: 600 12px/1.25 "Microsoft YaHei", "PingFang SC", Arial, sans-serif; text-align: center; background: repeating-linear-gradient(135deg, rgba(255, 198, 88, .35) 0 8px, rgba(255, 238, 183, .35) 8px 16px); border: 2px dashed rgba(143, 85, 26, .75); border-radius: 6px; box-shadow: inset 0 0 0 1px rgba(255,255,255,.45); }
  .spine-placeholder > div { max-width: 100%; overflow: hidden; text-overflow: ellipsis; }
  .meta { margin: 12px 0 0; font-size: 13px; opacity: .78; }
  .missing { max-width: ${width}px; font-size: 13px; color: #ffd08a; }
</style>
</head>
<body>
<div class="wrap">
  <div class="stage-scale"><div class="stage">${body}</div></div>
  <div class="meta">Static prefab preview: ${renderNodes.length} visible sprite/label/spine-placeholder nodes, bounds ${Math.round(bounds.minX)},${Math.round(bounds.minY)} to ${Math.round(bounds.maxX)},${Math.round(bounds.maxY)}, scale ${previewScale}.</div>
  ${missing ? `<ul class="missing">${missing}</ul>` : ''}
</div>
</body>
</html>`;

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, html);
fs.writeFileSync(manifestPathFor(outPath), JSON.stringify({
  outputDir: path.dirname(outPath),
  html: outPath,
  files: [...new Set(copiedAssets)],
  dirs: [...new Set(copiedAssets.map(file => path.dirname(file)))],
}, null, 2));
console.log(outPath);
