# Cocos Creator 3.8 Prefab Skill 工程

本项目提供一组基于 Node.js 的 Codex Skill，用于直接创建和修改 Cocos Creator 3.8 的 Prefab 序列化文件。脚本会维护节点、组件、PrefabInfo、CompPrefabInfo、UUID 和对象引用，减少手工编辑 `.prefab` JSON 时产生引用错误的风险。

## 当前技能

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

## 目录结构

```text
cocos-skill/
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

脚本会检查 `package.json` 中的 Creator 版本，并限制资源路径位于目标工程的 `assets` 目录内。

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

- 默认拒绝覆盖已有 Prefab。
- 默认拒绝同级重名节点和重复组件。
- 禁止资源路径越过目标工程的 `assets` 目录。
- 设置属性时禁止修改关键序列化关联字段。
- 推荐对复杂属性修改先使用 `--dry-run`。
