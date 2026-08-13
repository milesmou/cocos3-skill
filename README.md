# Cocos Creator 3.8 编辑器控制 Skill 工程

本项目提供一组 Codex Skill，用于查询和操控 Cocos Creator 3.8 的场景、Prefab、节点、组件和资源。

工作流通过 `cocos3-codex-bridge` 扩展调用 Creator 官方 Scene、AssetDB 消息和 Scene Script API，不直接修改 Prefab 序列化文件。

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

### plan-cocos-prefab-tree

只读分析自然语言、效果图或现有界面，生成经过一致性检查的 Prefab 节点蓝图；本技能不修改工程，实际创建交由 `assemble-cocos-ui`。

### assemble-cocos-ui

根据 `plan-cocos-prefab-tree` 或用户提供的明确蓝图执行场景或 Prefab 拼装，组织 Canvas、UITransform、Widget、Layout、Mask、ScrollView、事件和嵌套 Prefab，并执行专用 UI 校验。

### cocos-prefab-preview

通过 Creator 3.8.5-3.8.x Inspector 使用的内部 WebGL 渲染器，以强制 2D 模式导出真实 Prefab PNG。

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
    ├─ Creator 扩展 cocos3-codex-bridge
    │       ├─ Editor.Message → scene / asset-db
    │       └─ execute-scene-script → cc / cce API
```

通过 Creator 的实际类型注册、资源数据库、Prefab 管理和撤销系统完成内容修改。

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
├── plan-cocos-prefab-tree/
├── assemble-cocos-ui/
├── import-cocos-assets/
├── move-cocos-asset/
├── rename-cocos-asset/
├── tests/
└── README.md
```

技能目录通常包含：

- `SKILL.md`：触发说明与操作流程。
- `scripts/`：安装、连接、验证或资源处理所需的 Node.js 脚本。
- `agents/openai.yaml`：技能界面元数据。

## 环境要求

- Cocos Creator 3.8.x
- 可用的 `cocoscreator` 命令
- 同一个工程最多运行一个 Creator 实例；启动前先检查，已打开时复用现有实例
- Node.js 18 或更高版本
- 目标工程必须包含有效的 `package.json` 和 `assets` 目录

在线控制前，先确认目标工程没有已运行的 Creator 实例。工程已打开时直接复用，禁止重复启动；工程未打开时使用 `cocoscreator --project <工程目录>` 启动。需要重启时，先完全关闭旧实例，再执行启动命令。然后在目标工程安装并启用桥接扩展：

```powershell
cocoscreator --project <工程目录>
node control-cocos-editor/scripts/install-bridge.mjs --project <工程目录>
node control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> status
node control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> --timeout 60000 preview db://assets/ui/example.prefab temp/previews/example.png
```

脚本会检查 `package.json` 中的 Creator 版本。桥接服务只监听 `127.0.0.1`，连接信息和一次性令牌保存在目标工程的 `temp` 目录。

## 安全约束

- 场景和 Prefab 修改使用 Creator 官方消息。
- 桥接只允许预定义的 Scene 和 AssetDB 消息。
- 修改前查询 UUID 和当前状态，修改后保存并验证。
- 禁止资源路径越过目标工程的 `assets` 目录。
- 设置属性时禁止修改关键序列化关联字段。

## 验证

```powershell
node --test tests/*.test.mjs
node validate-cocos-content/scripts/validate-project.mjs --project <工程目录>
```
