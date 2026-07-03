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

## 目录结构

```text
cocos-skill/
├── create-cocos-prefab/
├── add-cocos-prefab-node/
├── add-cocos-node-component/
├── set-cocos-component-properties/
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
