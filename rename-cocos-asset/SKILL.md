---
name: rename-cocos-asset
description: 使用 Node.js 离线重命名 Cocos Creator 3.8 资源及配套 .meta，并保持 UUID。仅在 Creator 未运行且无法使用 AssetDB 桥接时作为后备；编辑器可用时应使用在线资源管理。
---

# 重命名 Cocos 资源

仅在目标工程的 Creator 未运行且无法使用编辑器桥接时执行。编辑器可用时，改用 `manage-cocos-assets` 的 AssetDB 移动流程。

使用技能内置脚本同步重命名资源和 `.meta`。不要创建新的 `.meta`。

命令中的 `<技能根目录>` 替换为本技能集合所在目录的绝对路径（包含 `control-cocos-editor` 等子目录），`<工程目录>` 替换为目标 Cocos 工程绝对路径；保留路径引号，不依赖当前工作目录。

## 操作流程

1. 指定相对于 `assets` 的资源路径和不含路径分隔符的新名称。文件资源必须保持扩展名不变。
2. 先验证：

   ```powershell
   node "<技能根目录>/rename-cocos-asset/scripts/rename-asset.mjs" --project "<工程目录>" --asset <资源路径> --name <新名称> --dry-run
   ```

3. 执行重命名：

   ```powershell
   node "<技能根目录>/rename-cocos-asset/scripts/rename-asset.mjs" --project "<工程目录>" --asset <资源路径> --name <新名称>
   ```

4. 新资源或新 `.meta` 已存在时停止，不覆盖。
5. 完成后验证资源和 `.meta` 名称一致，并核对 meta UUID 未变化。

脚本支持文件和目录资源，也支持 Windows 上仅改变大小写的名称修改。仅改变大小写时，中转文件固定创建在工程 `temp/rename-cocos-asset/operation-*`，不会在 `assets` 中生成临时文件；异常回滚失败时保留中转文件以便恢复。若需要改变目录位置，请使用资源移动技能。
