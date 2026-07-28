---
name: create-cocos-prefab
description: 使用 Node.js 在 Cocos Creator 3.8 工程中创建空 UI Prefab 资源。适用于在工程 assets 目录下创建、生成或添加新的空 .prefab 文件及其配套 .meta 文件。
---

# 创建 Cocos Prefab

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
