'use strict';

const { join } = require('node:path');
module.paths.push(join(Editor.App.path, 'node_modules'));

const {
  Color,
  Asset,
  EventHandler,
  Node,
  Quat,
  Size,
  UITransform,
  Vec2,
  Vec3,
  assetManager,
  director,
  js
} = require('cc');

const RESERVED_PROPERTIES = new Set([
  '_id', '_objFlags', '__type__', '__prefab', 'node', 'uuid', 'parent', 'children'
]);

function activeScene() {
  const scene = director.getScene();
  if (!scene) throw new Error('no active scene or prefab editing context');
  return scene;
}

function normalizePath(value) {
  return String(value || '').replaceAll('\\', '/').split('/').filter(Boolean);
}

function findByPath(root, nodePath) {
  const parts = normalizePath(nodePath);
  if (parts[0] === root.name) parts.shift();
  let current = root;
  for (const part of parts) {
    const matches = current.children.filter((child) => child.name === part);
    if (matches.length === 0) throw new Error(`node path not found at: ${part}`);
    if (matches.length > 1) throw new Error(`node path is ambiguous at: ${part}`);
    current = matches[0];
  }
  return current;
}

function findByUuid(root, uuid) {
  if (root.uuid === uuid) return root;
  for (const child of root.children) {
    const match = findByUuid(child, uuid);
    if (match) return match;
  }
  return null;
}

function findNode(selector, allowScene = true) {
  const root = activeScene();
  if (!selector || selector === '/' || selector === root.name) return root;
  const node = typeof selector === 'object' && selector.uuid
    ? findByUuid(root, selector.uuid)
    : typeof selector === 'string' && selector.startsWith('uuid:')
      ? findByUuid(root, selector.slice(5))
      : findByPath(root, typeof selector === 'object' ? selector.path : selector);
  if (!node || (!allowScene && node === root)) throw new Error(`node not found: ${JSON.stringify(selector)}`);
  return node;
}

function className(value) {
  return js.getClassName(value) || value?.constructor?.name || '<unknown>';
}

function prefabSummary(node) {
  const info = node._prefab;
  return info ? {
    assetUuid: info.asset?.uuid || info.asset?._uuid || null,
    fileId: info.fileId || null,
    instanceRoot: info.instance?.root?.uuid || null,
    isPrefabRoot: info.root === node
  } : null;
}

function summarizeNode(node, depth, maxDepth, includeComponents) {
  const output = {
    uuid: node.uuid,
    name: node.name,
    path: node.getPathInHierarchy(),
    active: node.active,
    activeInHierarchy: node.activeInHierarchy,
    layer: node.layer,
    position: { x: node.position.x, y: node.position.y, z: node.position.z },
    rotation: { x: node.eulerAngles.x, y: node.eulerAngles.y, z: node.eulerAngles.z },
    scale: { x: node.scale.x, y: node.scale.y, z: node.scale.z },
    siblingIndex: node.getSiblingIndex(),
    prefab: prefabSummary(node)
  };
  if (includeComponents) {
    output.components = node.components.map((component) => ({
      uuid: component.uuid,
      type: className(component),
      enabled: component.enabled
    }));
  }
  output.children = depth < maxDepth
    ? node.children.map((child) => summarizeNode(child, depth + 1, maxDepth, includeComponents))
    : node.children.map((child) => ({ uuid: child.uuid, name: child.name, truncated: true }));
  return output;
}

function findComponent(node, selector) {
  const components = node.components;
  if (typeof selector === 'object' && selector.uuid) {
    const match = components.find((component) => component.uuid === selector.uuid);
    if (!match) throw new Error(`component UUID not found on ${node.name}: ${selector.uuid}`);
    return match;
  }
  const type = typeof selector === 'object' ? selector.type : selector;
  const index = typeof selector === 'object' ? Number(selector.index || 0) : 0;
  const matches = components.filter((component) => className(component) === type);
  if (!matches[index]) throw new Error(`component ${type}[${index}] not found on ${node.name}`);
  return matches[index];
}

function hasType(node, type) {
  return Array.isArray(node?.components) && node.components.some((component) => {
    const name = className(component);
    return name === type || name === `cc.${type}` || name.endsWith(`.${type}`);
  });
}

function componentOfType(node, type) {
  return node?.components?.find((component) => {
    const name = className(component);
    return name === type || name === `cc.${type}` || name.endsWith(`.${type}`);
  }) || null;
}

function assetUuid(asset) {
  return asset?._uuid || asset?.uuid || null;
}

function summarizeUI(node, depth, maxDepth) {
  const transform = componentOfType(node, 'UITransform');
  const widget = componentOfType(node, 'Widget');
  const layout = componentOfType(node, 'Layout');
  const output = {
    uuid: node.uuid,
    name: node.name,
    path: node.getPathInHierarchy(),
    active: node.active,
    siblingIndex: node.getSiblingIndex(),
    position: { x: node.position.x, y: node.position.y, z: node.position.z },
    uiTransform: transform ? {
      width: transform.width,
      height: transform.height,
      anchorX: transform.anchorX,
      anchorY: transform.anchorY
    } : null,
    widget: widget ? {
      alignMode: widget.alignMode,
      alignFlags: widget.alignFlags,
      top: widget.top,
      bottom: widget.bottom,
      left: widget.left,
      right: widget.right,
      horizontalCenter: widget.horizontalCenter,
      verticalCenter: widget.verticalCenter
    } : null,
    layout: layout ? {
      type: layout.type,
      resizeMode: layout.resizeMode,
      spacingX: layout.spacingX,
      spacingY: layout.spacingY,
      paddingLeft: layout.paddingLeft,
      paddingRight: layout.paddingRight,
      paddingTop: layout.paddingTop,
      paddingBottom: layout.paddingBottom,
      constraint: layout.constraint,
      constraintNum: layout.constraintNum
    } : null,
    components: node.components.map((component) => {
      const item = { uuid: component.uuid, type: className(component), enabled: component.enabled };
      if ('spriteFrame' in component) item.spriteFrame = assetUuid(component.spriteFrame);
      if ('font' in component) item.font = assetUuid(component.font);
      if ('content' in component) item.content = component.content?.uuid || null;
      if ('view' in component) item.view = component.view?.uuid || null;
      return item;
    })
  };
  output.children = depth < maxDepth
    ? node.children.map((child) => summarizeUI(child, depth + 1, maxDepth))
    : node.children.map((child) => ({ uuid: child.uuid, name: child.name, truncated: true }));
  return output;
}

function validateUIRoot(root, options = {}) {
  const issues = [];
  const push = (severity, code, node, message, extra = {}) => {
    issues.push({ severity, code, node: node.getPathInHierarchy(), uuid: node.uuid, message, ...extra });
  };
  function visit(node, belowCanvas) {
    const types = node.components.map(className);
    const transform = componentOfType(node, 'UITransform');
    const mask = componentOfType(node, 'Mask');
    const scrollView = componentOfType(node, 'ScrollView');
    const widget = componentOfType(node, 'Widget');
    const isCanvas = hasType(node, 'Canvas') || hasType(node, 'RenderRoot2D');
    const isUI = Boolean(transform) || node.components.some((component) =>
      /(Widget|Layout|Sprite|Label|RichText|Button|Toggle|EditBox|ScrollView|Mask|Graphics|UIOpacity)$/.test(className(component))
    );

    if (isUI && !transform) push('error', 'missing-ui-transform', node, 'UI node has UI components but no UITransform');
    if (isUI && !belowCanvas && !isCanvas) push('warning', 'outside-render-root', node, 'UI node is not under Canvas or RenderRoot2D');
    if (widget && !componentOfType(node.parent || {}, 'UITransform')) {
      push('error', 'widget-parent-without-ui-transform', node, 'Widget requires a parent with UITransform');
    }
    if (transform && (transform.width <= 0 || transform.height <= 0)) {
      if (node.components.some((component) => /(Sprite|Label|RichText|Button|Mask|ScrollView)$/.test(className(component)))) {
        push('warning', 'non-positive-ui-size', node, 'rendering or interactive UI node has non-positive width or height');
      }
    }
    if (mask) {
      const spriteStencil = Number(mask.type) === 3;
      const conflicting = types.filter((type) => /(Label|RichText|Skeleton|DragonBones|ParticleSystem2D)$/.test(type));
      if (!spriteStencil && types.some((type) => /Sprite$/.test(type))) conflicting.push('cc.Sprite');
      if (conflicting.length) push('error', 'mask-renderer-conflict', node, 'Mask cannot share a node with other renderer components', { components: conflicting });
      if (spriteStencil && !hasType(node, 'Sprite')) push('error', 'mask-missing-sprite', node, 'SPRITE_STENCIL Mask requires Sprite');
      if (!spriteStencil && !hasType(node, 'Graphics')) push('error', 'mask-missing-graphics', node, 'non-sprite Mask requires Graphics');
    }
    if (scrollView) {
      if (!scrollView.content) push('error', 'scroll-view-missing-content', node, 'ScrollView content is not assigned');
      if (!scrollView.view) push('warning', 'scroll-view-missing-view', node, 'ScrollView view is not assigned');
      if (scrollView.content && scrollView.view && !scrollView.content.isChildOf(scrollView.view)) {
        push('error', 'scroll-view-content-outside-view', node, 'ScrollView content must be a descendant of its view');
      }
    }
    const siblingNames = new Set();
    for (const child of node.children) {
      if (siblingNames.has(child.name)) push('warning', 'duplicate-sibling-name', child, 'duplicate sibling name makes path selectors ambiguous');
      siblingNames.add(child.name);
    }
    for (const component of node.components) {
      for (const value of Object.values(component)) {
        if (!Array.isArray(value)) continue;
        for (const entry of value) {
          if (!(entry instanceof EventHandler)) continue;
          if (!entry.target) {
            push('error', 'event-target-missing', node, 'EventHandler target is missing', { component: className(component) });
            continue;
          }
          const targetComponent = entry.target.getComponent(entry.component);
          if (!targetComponent) {
            push('error', 'event-component-missing', node, `EventHandler component is missing: ${entry.component}`, { component: className(component) });
          } else if (typeof targetComponent[entry.handler] !== 'function') {
            push('error', 'event-method-missing', node, `EventHandler method is missing: ${entry.handler}`, { component: entry.component });
          }
        }
      }
    }
    for (const child of node.children) visit(child, belowCanvas || isCanvas);
  }
  visit(root, Boolean(options.assumeRenderRoot));
  return issues;
}

function serializeValue(value, depth = 0) {
  if (depth > 4) return '<max-depth>';
  if (value === null || value === undefined || ['string', 'number', 'boolean'].includes(typeof value)) return value;
  if (value instanceof Node) return { $node: value.getPathInHierarchy(), uuid: value.uuid };
  if (value?.node instanceof Node && value.uuid) return {
    $component: className(value),
    uuid: value.uuid,
    node: value.node.getPathInHierarchy()
  };
  if (value instanceof Asset) return { $asset: value._uuid || value.uuid, type: className(value) };
  if (Array.isArray(value)) return value.map((entry) => serializeValue(entry, depth + 1));
  if ([Vec2, Vec3, Quat, Color, Size].some((Type) => value instanceof Type)) {
    return { $type: className(value), ...Object.fromEntries(Object.keys(value).map((key) => [key, value[key]])) };
  }
  return `<${className(value)}>`;
}

async function resolveValue(value) {
  if (Array.isArray(value)) return Promise.all(value.map(resolveValue));
  if (!value || typeof value !== 'object') return value;
  if ('$node' in value) return findNode(value.$node);
  if ('$component' in value) {
    const descriptor = value.$component;
    return findComponent(findNode(descriptor.node), descriptor);
  }
  if ('$asset' in value) {
    const uuid = typeof value.$asset === 'string' ? value.$asset : value.$asset.uuid;
    return new Promise((resolve, reject) => {
      assetManager.loadAny({ uuid }, (error, asset) => error ? reject(error) : resolve(asset));
    });
  }
  if ('$eventHandler' in value) {
    const descriptor = value.$eventHandler;
    if (!descriptor?.target || !descriptor?.component || !descriptor?.handler) {
      throw new Error('$eventHandler requires target, component, and handler');
    }
    const eventHandler = new EventHandler();
    eventHandler.target = findNode(descriptor.target);
    eventHandler.component = String(descriptor.component);
    eventHandler.handler = String(descriptor.handler);
    eventHandler.customEventData = String(descriptor.customEventData || '');
    return eventHandler;
  }
  if ('$type' in value) {
    const fields = { ...value };
    delete fields.$type;
    const constructors = { Vec2, Vec3, Quat, Color, Size };
    const Type = constructors[String(value.$type).replace(/^cc\./, '')];
    if (!Type) throw new Error(`unsupported value type: ${value.$type}`);
    return Object.assign(new Type(), fields);
  }
  const output = {};
  for (const [key, entry] of Object.entries(value)) output[key] = await resolveValue(entry);
  return output;
}

async function setProperties(target, values) {
  if (!values || Array.isArray(values) || typeof values !== 'object') throw new Error('values must be an object');
  const changed = [];
  for (const [key, rawValue] of Object.entries(values)) {
    if (RESERVED_PROPERTIES.has(key)) throw new Error(`cannot assign reserved property: ${key}`);
    if (!(key in target)) throw new Error(`property does not exist on ${className(target)}: ${key}`);
    target[key] = await resolveValue(rawValue);
    changed.push(key);
  }
  return changed;
}

function collectIssues(root) {
  const issues = [];
  const uuids = new Set();
  function visit(node) {
    if (uuids.has(node.uuid)) issues.push({ code: 'duplicate-node-uuid', node: node.getPathInHierarchy(), uuid: node.uuid });
    uuids.add(node.uuid);
    for (const component of node.components) {
      const type = className(component);
      if (!type || type === '<unknown>' || type.includes('Missing')) {
        issues.push({ code: 'missing-component-script', node: node.getPathInHierarchy(), uuid: component.uuid, type });
      }
      if (component.node !== node) {
        issues.push({ code: 'component-node-mismatch', node: node.getPathInHierarchy(), uuid: component.uuid, type });
      }
    }
    for (const child of node.children) {
      if (child.parent !== node) issues.push({ code: 'parent-child-mismatch', node: child.name, uuid: child.uuid });
      visit(child);
    }
  }
  visit(root);
  return issues;
}

exports.methods = {
  inspectTree(options = {}) {
    const root = options.root ? findNode(options.root) : activeScene();
    return summarizeNode(root, 0, Number.isInteger(options.maxDepth) ? options.maxDepth : 32, options.components !== false);
  },

  inspectNode(selector) {
    return summarizeNode(findNode(selector), 0, 0, true);
  },

  inspectUILayout(selector, options = {}) {
    const root = selector ? findNode(selector) : activeScene();
    return summarizeUI(root, 0, Number.isInteger(options.maxDepth) ? options.maxDepth : 32);
  },

  inspectComponent(nodeSelector, componentSelector, options = {}) {
    const component = findComponent(findNode(nodeSelector), componentSelector);
    const properties = {};
    const keys = Array.isArray(options.properties) ? options.properties : Object.keys(component);
    for (const key of keys) {
      if (!key.startsWith('_') || options.includePrivate) properties[key] = serializeValue(component[key]);
    }
    return {
      uuid: component.uuid,
      type: className(component),
      node: component.node.getPathInHierarchy(),
      enabled: component.enabled,
      properties
    };
  },

  async createNode(options = {}) {
    const parent = options.parent ? findNode(options.parent) : activeScene();
    const node = new Node(options.name || 'New Node');
    if (options.ui) node.addComponent(UITransform);
    node.parent = parent;
    if (options.position) node.setPosition(options.position.x || 0, options.position.y || 0, options.position.z || 0);
    if (options.rotation) node.setRotationFromEuler(options.rotation.x || 0, options.rotation.y || 0, options.rotation.z || 0);
    if (options.scale) node.setScale(options.scale.x ?? 1, options.scale.y ?? 1, options.scale.z ?? 1);
    if (typeof options.active === 'boolean') node.active = options.active;
    if (Number.isInteger(options.siblingIndex)) node.setSiblingIndex(options.siblingIndex);
    return summarizeNode(node, 0, 0, true);
  },

  async updateNode(selector, values) {
    const node = findNode(selector, false);
    const changed = [];
    if ('name' in values) { node.name = String(values.name); changed.push('name'); }
    if ('active' in values) { node.active = Boolean(values.active); changed.push('active'); }
    if ('layer' in values) { node.layer = Number(values.layer); changed.push('layer'); }
    if (values.position) { node.setPosition(values.position.x || 0, values.position.y || 0, values.position.z || 0); changed.push('position'); }
    if (values.rotation) { node.setRotationFromEuler(values.rotation.x || 0, values.rotation.y || 0, values.rotation.z || 0); changed.push('rotation'); }
    if (values.scale) { node.setScale(values.scale.x ?? 1, values.scale.y ?? 1, values.scale.z ?? 1); changed.push('scale'); }
    if (values.parent) { node.parent = findNode(values.parent); changed.push('parent'); }
    if (Number.isInteger(values.siblingIndex)) { node.setSiblingIndex(values.siblingIndex); changed.push('siblingIndex'); }
    return { uuid: node.uuid, path: node.getPathInHierarchy(), changed };
  },

  listComponents(selector) {
    return findNode(selector).components.map((component) => ({
      uuid: component.uuid,
      type: className(component),
      enabled: component.enabled
    }));
  },

  addComponent(nodeSelector, type) {
    const node = findNode(nodeSelector, false);
    const ComponentType = js.getClassByName(type);
    if (!ComponentType) throw new Error(`component class is not registered: ${type}`);
    const component = node.addComponent(ComponentType);
    return { uuid: component.uuid, type: className(component), node: node.getPathInHierarchy() };
  },

  async setComponentProperties(nodeSelector, componentSelector, values) {
    const component = findComponent(findNode(nodeSelector), componentSelector);
    return {
      uuid: component.uuid,
      type: className(component),
      changed: await setProperties(component, values)
    };
  },

  validateScene() {
    const root = activeScene();
    const issues = collectIssues(root);
    return {
      scene: root.name,
      uuid: root.uuid,
      valid: issues.length === 0,
      issueCount: issues.length,
      issues
    };
  },

  validateUI(selector, options = {}) {
    const root = selector ? findNode(selector) : activeScene();
    const issues = validateUIRoot(root, options);
    return {
      root: root.getPathInHierarchy(),
      uuid: root.uuid,
      valid: !issues.some((issue) => issue.severity === 'error'),
      errorCount: issues.filter((issue) => issue.severity === 'error').length,
      warningCount: issues.filter((issue) => issue.severity === 'warning').length,
      issues
    };
  },

  async prefabAction(action, selector, options = {}) {
    const node = findNode(selector, false);
    if (action === 'apply') return { action, uuid: node.uuid, result: await cce.Prefab.applyPrefab(node.uuid) };
    if (action === 'unlink') return { action, uuid: node.uuid, result: cce.Prefab.unWrapPrefabInstance(node.uuid, Boolean(options.removeNested)) };
    if (action === 'restore') return { action, uuid: node.uuid, result: await cce.Prefab.revertPrefab(node.uuid) };
    if (action === 'create') {
      if (typeof options.url !== 'string' || !options.url.startsWith('db://assets/')) {
        throw new Error('create requires options.url under db://assets/');
      }
      return { action, uuid: node.uuid, result: await cce.Prefab.createPrefabAssetFromNode(node.uuid, options.url) };
    }
    if (action === 'link') {
      if (typeof options.assetUuid !== 'string' || !options.assetUuid) throw new Error('link requires options.assetUuid');
      await cce.Prefab.linkNodeWithPrefabAsset(node.uuid, options.assetUuid);
      return { action, uuid: node.uuid, result: true };
    }
    throw new Error(`unsupported prefab action: ${action}`);
  },

  async animationQuery(action, ...args) {
    const methods = new Set([
      'queryAnimationRoot',
      'queryAnimationRootInfo',
      'queryAnimationClipDump',
      'queryAnimationNodeEditInfo',
      'queryAnimClipsInfo',
      'queryPlayState',
      'setEditClip'
    ]);
    if (!methods.has(action) || typeof cce.Animation[action] !== 'function') {
      throw new Error(`unsupported animation query: ${action}`);
    }
    return cce.Animation[action](...args);
  },

  async animationOperation(operations, options = {}) {
    if (!Array.isArray(operations) || operations.length === 0) throw new Error('operations must be a non-empty array');
    return cce.Animation.operation(operations, options);
  },

  async saveAnimation() {
    return cce.Animation.save();
  }
};

exports.load = function load() {};
exports.unload = function unload() {};
