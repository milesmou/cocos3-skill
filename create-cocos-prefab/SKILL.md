---
name: create-cocos-prefab
description: 使用 Node.js 在 Cocos Creator 3.8 工程中离线创建空 UI Prefab 及配套 .meta。仅在 Creator 未运行且无法使用编辑器桥接时作为后备；编辑器可用时应通过在线 Prefab 管理流程创建资源。
---

# 创建 Cocos Prefab

仅在目标工程的 Creator 未运行且无法使用编辑器桥接时执行。编辑器可用时，改用 `manage-cocos-prefab-instance` 和 `manage-cocos-assets`。

使用技能内置脚本创建资源。不要手动编写 UUID 或 Prefab fileId。

## 操作流程

1. 检查 `package.json`，确认目标是 Cocos Creator 3.8 工程。
2. 选择相对于工程 `assets` 目录的路径。Prefab 名称会同时作为根节点名称。
3. 运行：

   ```powershell
   node scripts/create-prefab.mjs --project <工程目录> --path <资源相对路径> [--size <宽度,高度>]
   ```

   示例：`--path prefab/Prefab1.prefab --size 360,260`。`.prefab` 后缀可以省略，默认尺寸为 `100,100`。
4. 默认不覆盖现有资源。只有用户明确要求替换时才使用 `--force`。
5. 报告生成的两个文件。若 Creator 已打开，提醒用户刷新资源目录。

脚本会创建兼容 Creator 3.8 的空 UI Prefab，其中包含一个根 `cc.Node`、一个 `cc.UITransform`、Prefab 关联记录和配套 `.prefab.meta` 文件。未特意指定 Layer 时，Prefab 根节点及后续创建的所有节点统一使用 `UI_2D`（`33554432`）。资源路径必须位于 `assets` 内。
