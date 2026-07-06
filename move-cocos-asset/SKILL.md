---
name: move-cocos-asset
description: 使用 Node.js 在 Cocos Creator 3.8 工程的 assets 内移动资源及其配套 .meta 文件。适用于改变文件或目录资源的位置，同时保持资源名称、meta 内容和 UUID 不变。
---

# 移动 Cocos 资源

使用技能内置脚本成对移动资源和 `.meta`。不要只移动资源本体，否则 Creator 会生成新 UUID。

## 操作流程

1. 指定相对于 `assets` 的原路径和完整目标路径。移动操作必须保持资源名称不变。
2. 先验证：

   ```powershell
   node scripts/move-asset.mjs --project <工程目录> --from <原资源路径> --to <目标资源路径> --dry-run
   ```

3. 执行移动：

   ```powershell
   node scripts/move-asset.mjs --project <工程目录> --from <原资源路径> --to <目标资源路径>
   ```

4. 目标父目录必须已经是有效的 Creator 资源目录，并具有配套 `.meta`。目标资源或目标 `.meta` 已存在时停止，不覆盖。
5. 完成后验证资源与 `.meta` 均位于目标位置，并核对 UUID 未变化。

脚本支持文件和目录资源。若需要改变名称，请使用资源重命名技能。
