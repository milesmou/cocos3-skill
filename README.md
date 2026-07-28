# Cocos Creator 3.8 编辑器控制 Skill 工程

本项目提供一组 Codex Skill，用于查询和操控 Cocos Creator 3.8 的场景、Prefab、节点、组件和资源。

首选工作流通过 `cocos-codex-bridge` 扩展调用 Creator 官方 Scene、AssetDB 消息和 Scene Script API。原有直接修改 Prefab 序列化文件的脚本保留为编辑器无法启动时的离线后备。

## 当前技能

### control-cocos-editor

安装本机认证的 Creator 3.8 桥接扩展，并通过统一 CLI 调用 Scene、AssetDB 和 Scene Script。

### inspect-cocos-content

只读查询当前场景或 Prefab 的节点树、组件、属性、Prefab 状态以及资源依赖关系。

### manage-cocos-scene

查询、打开、保存、关闭和配置场景。

### manage-cocos-node

创建、复制、变换、移动、重排和删除当前编辑上下文中的 2D/3D 节点。

### manage-cocos-prefab-instance

实例化 Prefab，并管理实例恢复、应用和解除关联。

### manage-cocos-components

通过注册类名和组件 UUID 管理任意内置或自定义组件。

### manage-cocos-assets

通过 AssetDB 查询、创建、导入、复制、移动、重命名、删除和重新导入资源。

### validate-cocos-content

在线验证当前场景，并离线检查所有场景、Prefab、`.meta`、UUID 和对象引用。

### create-cocos-component-script

通过 AssetDB 创建 TypeScript 组件脚本，等待导入并确认组件注册。

### manage-cocos-event-handlers

配置 Button、Toggle、ScrollView 等组件的 Inspector 事件回调。

### manage-cocos-animation

查询 AnimationClip dump，并通过 Creator 动画管理器提交和保存动画操作。

### assemble-cocos-ui

按 Creator 3.8 的 UI 约束拼装场景或 Prefab，组织 Canvas、UITransform、Widget、Layout、Mask、ScrollView、事件和嵌套 Prefab，并执行专用 UI 校验。

## 离线 Prefab 技能

### create-cocos-prefab

创建空 UI Prefab 及配套 `.meta` 文件，可指定根节点尺寸，并保护现有资源不被意外覆盖。

### add-cocos-prefab-node

向 Prefab 根节点或指定节点路径添加空 UI 子节点，可设置位置、尺寸和锚点。

### add-cocos-node-component

为节点添加常用 2D/UI 内置组件或自定义 TypeScript 组件。支持 Sprite、Label、Button、Graphics、Mask、Layout、ScrollView、PageView、ProgressBar、Toggle、Widget、VideoPlayer 等组件。Sprite 默认使用引擎的 `default_sprite_splash.png`。

### set-cocos-component-properties

设置内置或自定义组件的序列化属性，支持基础值、值类型、数组、节点引用、组件引用以及 SpriteFrame、Texture2D、TextAsset、JsonAsset、AudioClip、Prefab、Material 等资源引用。

### remove-cocos-node-component

从节点安全移除内置或自定义组件，删除配套 `CompPrefabInfo`，并在压缩对象表后重映射全部 `__id__`。默认保护 `UITransform`，且会拒绝删除仍被其他对象引用的组件。

### remove-cocos-prefab-node

从 Prefab 安全删除节点及其完整子树，通过可达性分析清理所属组件和关联对象，并重映射全部 `__id__`。禁止删除根节点，且会保护仍被外部属性引用的节点或组件。

### rename-cocos-prefab-node

按节点路径修改根节点或子节点名称，提供同级重名保护和 dry-run。修改根节点时同步 Prefab 资源名及 `.meta` 中的 `syncNodeName`。

### import-cocos-assets

将外部文件或目录批量导入 Creator 3.8 工程，生成主 UUID、图片子资源 UUID 和 Spine atlas 关联。支持 PNG、脚本、JSON、文本、音频、Effect、Material 与 Spine 资源组。

### move-cocos-asset

在 `assets` 内移动文件或目录资源，并同步移动配套 `.meta`。资源名称和 meta 内容保持不变，从而保留 UUID。

### rename-cocos-asset

在原目录同步重命名资源和 `.meta`，保持文件扩展名、meta 内容及 UUID 不变，并支持仅修改名称大小写。

## 架构

```text
Codex Skill
    │
    ├─ control-cocos-editor/scripts/cocos-editor.mjs
    │       │  localhost + 临时令牌
    │       ▼
    ├─ Creator 扩展 cocos-codex-bridge
    │       ├─ Editor.Message → scene / asset-db
    │       └─ execute-scene-script → cc / cce API
    │
    └─ 离线后备脚本 → .prefab / .meta
```

在线模式可以使用 Creator 的实际类型注册、资源数据库、Prefab 管理和撤销系统。离线模式不应在 Creator 正在编辑同一资源时使用。

## 目录结构

```text
cocos-skill/
├── control-cocos-editor/
├── inspect-cocos-content/
├── manage-cocos-scene/
├── manage-cocos-node/
├── manage-cocos-prefab-instance/
├── manage-cocos-components/
├── manage-cocos-assets/
├── validate-cocos-content/
├── create-cocos-component-script/
├── manage-cocos-event-handlers/
├── manage-cocos-animation/
├── assemble-cocos-ui/
├── create-cocos-prefab/
├── add-cocos-prefab-node/
├── add-cocos-node-component/
├── set-cocos-component-properties/
├── remove-cocos-node-component/
├── remove-cocos-prefab-node/
├── rename-cocos-prefab-node/
├── import-cocos-assets/
├── move-cocos-asset/
├── rename-cocos-asset/
├── tests/
└── README.md
```

每个技能目录包含：

- `SKILL.md`：触发说明与操作流程。
- `scripts/`：执行 Prefab 操作的 Node.js 脚本。
- `agents/openai.yaml`：技能界面元数据。

## 环境要求

- Cocos Creator 3.8.x
- Node.js 18 或更高版本
- 目标工程必须包含有效的 `package.json` 和 `assets` 目录

在线控制需要在目标工程安装并启用桥接扩展：

```powershell
node control-cocos-editor/scripts/install-bridge.mjs --project <工程目录>
node control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> status
```

脚本会检查 `package.json` 中的 Creator 版本。桥接服务只监听 `127.0.0.1`，连接信息和一次性令牌保存在目标工程的 `temp` 目录。

## 基本示例

```powershell
# 创建 Prefab
node create-cocos-prefab/scripts/create-prefab.mjs `
  --project D:\Workspace\NewProject `
  --path prefab/Example.prefab `
  --size 360,240

# 添加节点
node add-cocos-prefab-node/scripts/add-node.mjs `
  --project D:\Workspace\NewProject `
  --prefab prefab/Example.prefab `
  --name Title `
  --position 0,80 `
  --size 240,40

# 添加 Label
node add-cocos-node-component/scripts/add-component.mjs `
  --project D:\Workspace\NewProject `
  --prefab prefab/Example.prefab `
  --node Title `
  --component Label

# 设置 Label 属性
node set-cocos-component-properties/scripts/set-properties.mjs `
  --project D:\Workspace\NewProject `
  --prefab prefab/Example.prefab `
  --node Title `
  --component Label `
  --values '{"_string":"示例标题","_fontSize":24}'
```

## 安全约束

- 在线修改优先使用 Creator 官方消息。
- 桥接只允许预定义的 Scene 和 AssetDB 消息。
- 修改前查询 UUID 和当前状态，修改后保存并验证。
- 默认拒绝覆盖已有 Prefab。
- 默认拒绝同级重名节点和重复组件。
- 禁止资源路径越过目标工程的 `assets` 目录。
- 设置属性时禁止修改关键序列化关联字段。
- 推荐对复杂属性修改先使用 `--dry-run`。

## 验证

```powershell
node --test tests/*.test.mjs
node validate-cocos-content/scripts/validate-project.mjs --project <工程目录>
```
