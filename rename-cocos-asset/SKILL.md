---
name: rename-cocos-asset
description: 使用 Node.js 重命名 Cocos Creator 3.8 工程中的资源及其配套 .meta 文件。适用于在原目录修改文件或目录资源名称，同时保持 meta 内容和 UUID 不变。
---

# 重命名 Cocos 资源

使用技能内置脚本同步重命名资源和 `.meta`。不要创建新的 `.meta`。

## 操作流程

1. 指定相对于 `assets` 的资源路径和不含路径分隔符的新名称。文件资源必须保持扩展名不变。
2. 先验证：

   ```powershell
   node scripts/rename-asset.mjs --project <工程目录> --asset <资源路径> --name <新名称> --dry-run
   ```

3. 执行重命名：

   ```powershell
   node scripts/rename-asset.mjs --project <工程目录> --asset <资源路径> --name <新名称>
   ```

4. 新资源或新 `.meta` 已存在时停止，不覆盖。
5. 完成后验证资源和 `.meta` 名称一致，并核对 meta UUID 未变化。

脚本支持文件和目录资源，也支持 Windows 上仅改变大小写的名称修改。若需要改变目录位置，请使用资源移动技能。
