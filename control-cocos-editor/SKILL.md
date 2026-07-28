---
name: control-cocos-editor
description: 安装并使用本地认证桥接扩展，通过 Cocos Creator 3.8 官方 Scene、AssetDB 消息和 Scene Script API 控制编辑器。适用于连接编辑器、执行原子查询或修改、保存内容、等待资源导入，以及为其他 Cocos 管理技能提供公共通信底座。
---

# 控制 Cocos Creator 编辑器

优先通过 Creator 官方消息修改打开的场景、Prefab 和资源。只有编辑器无法启动时，才使用现有离线 Prefab 脚本。

## 首次安装

1. 安装桥接扩展：

   ```powershell
   node scripts/install-bridge.mjs --project <工程目录>
   ```

2. 在 Creator 的扩展管理器中刷新并启用 `cocos-codex-bridge`。
3. 检查连接：

   ```powershell
   node scripts/cocos-editor.mjs --project <工程目录> status
   ```

4. 自动化流程不要使用固定延时，等待 Scene 与 AssetDB 就绪：

   ```powershell
   node scripts/cocos-editor.mjs --project <工程目录> --timeout 60000 wait ready
   node scripts/cocos-editor.mjs --project <工程目录> --timeout 60000 wait idle
   ```

连接文件只写入目标工程的 `temp/cocos-codex-bridge.json`，服务只监听 `127.0.0.1`，每次扩展启动都会生成新令牌。

## 调用

使用统一命令调用 Scene、AssetDB 或 Scene Script：

```powershell
node scripts/cocos-editor.mjs --project <工程目录> request scene query-node-tree '[]'
node scripts/cocos-editor.mjs --project <工程目录> request asset-db query-assets '[{"pattern":"db://assets/**"}]'
node scripts/cocos-editor.mjs --project <工程目录> request scene-script inspectTree '[{"maxDepth":6}]'
```

完整方法和参数见 [references/api.md](references/api.md)。

## 安全规则

- 修改前先查询目标 UUID、当前属性和 Prefab 状态。
- 优先使用 `scene` 消息执行修改，以进入 Creator 撤销记录。
- 仅在公开消息无法表达操作时使用 Scene Script 修改方法。
- 资源路径优先使用 `db://assets/...`。
- 修改后保存场景或 Prefab，再运行内容验证。
- 资源导入、脚本编译和场景切换后使用 `wait` 轮询实际状态，不猜测等待秒数。
- 不把连接文件、令牌或 `temp` 内容提交到仓库。
- 不开放非本机监听地址，不向桥接白名单加入任意消息转发。
- `references/api.md` 标出的 protected AssetDB 消息只用于 Creator 3.8.x；升级编辑器前重新核对本机类型声明。
