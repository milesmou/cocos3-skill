---
name: control-cocos-editor
description: 安装并使用本地认证桥接扩展，通过 Cocos Creator 3.8 官方 Scene、AssetDB 消息和 Scene Script API 控制编辑器。适用于连接编辑器、执行原子查询或修改、保存内容、等待资源导入，以及为其他 Cocos 管理技能提供公共通信底座。
---

# 控制 Cocos Creator 编辑器

通过 Creator 官方消息修改打开的场景、Prefab 和资源，不直接改写 Prefab 序列化文件。

## 首次安装

1. 先确认目标工程是否已有 Creator 实例。每个工程最多只能运行一个实例；如果工程已经打开，必须复用现有实例，不得再次启动。
2. 工程未打开时，使用 `cocoscreator` 命令启动目标工程：

   ```powershell
   cocoscreator --project <工程目录>
   ```

   需要重启时，先完全关闭该工程的现有 Creator 实例，再执行启动命令。
3. 安装桥接扩展：

   ```powershell
   node scripts/install-bridge.mjs --project <工程目录>
   ```

4. 在 Creator 的扩展管理器中刷新并启用 `cocos3-codex-bridge`。
5. 检查连接：

   ```powershell
   node scripts/cocos-editor.mjs --project <工程目录> status
   ```

   返回结果中的 `editorDirectory` 是当前 Cocos Creator 编辑器的安装目录。

6. 自动化流程不要使用固定延时，等待 Scene 与 AssetDB 就绪：

   ```powershell
   node scripts/cocos-editor.mjs --project <工程目录> --timeout 60000 wait ready
   node scripts/cocos-editor.mjs --project <工程目录> --timeout 60000 wait idle
   ```

连接文件只写入目标工程的 `temp/cocos3-codex-bridge.json`，服务只监听 `127.0.0.1`，每次扩展启动都会生成新令牌。

## 调用

使用统一命令调用 Scene、AssetDB 或 Scene Script：

```powershell
node scripts/cocos-editor.mjs --project <工程目录> request scene query-node-tree '[]'
node scripts/cocos-editor.mjs --project <工程目录> request asset-db query-assets '[{"pattern":"db://assets/**"}]'
node scripts/cocos-editor.mjs --project <工程目录> request scene-script inspectTree '[{"maxDepth":6}]'
```

完整方法和参数见 [references/api.md](references/api.md)。

## 导出 Prefab PNG

Creator 3.8.5-3.8.x 可调用 Inspector 使用的内部 WebGL 预览器：

```powershell
node scripts/cocos-editor.mjs --project <工程目录> --timeout 60000 --width 1024 --height 768 preview db://assets/ui/example.prefab temp/previews/example.png
```

该接口属于 Creator 内部实现。桥接会检查版本、强制确认 2D 预览模式并限制输出位于目标工程内；编辑器不可用或内部接口失败时停止并报告。

## 安全规则

- 启动或重新启动工程时使用 `cocoscreator --project <工程目录>`。
- 同一个工程最多运行一个 Creator 实例；启动前检查现有实例，已打开时直接复用。重启时必须先完全关闭旧实例。
- 修改前先查询目标 UUID、当前属性和 Prefab 状态。
- 优先使用 `scene` 消息执行修改，以进入 Creator 撤销记录。
- 仅在公开消息无法表达操作时使用 Scene Script 修改方法。
- 资源路径优先使用 `db://assets/...`。
- 修改后保存场景或 Prefab，再运行内容验证。
- 资源导入、脚本编译和场景切换后使用 `wait` 轮询实际状态，不猜测等待秒数。
- 不把连接文件、令牌或 `temp` 内容提交到仓库。
- 不开放非本机监听地址，不向桥接白名单加入任意消息转发。
- `references/api.md` 标出的 protected AssetDB 消息只用于 Creator 3.8.x；升级编辑器前重新核对本机类型声明。
