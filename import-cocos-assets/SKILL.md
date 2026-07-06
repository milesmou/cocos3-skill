---
name: import-cocos-assets
description: 使用 Node.js 将外部资源复制并导入 Cocos Creator 3.8 工程，生成兼容的 .meta、主 UUID 和子资源 UUID。适用于导入 PNG、TypeScript、JavaScript、JSON、文本、MP3、Effect、Material 以及 Spine skel/atlas/png 资源组。
---

# 导入 Cocos 外部资源

使用技能内置脚本复制资源并生成 Creator 3.8 元数据。不要手工复制样本 `.meta`，以免不同工程之间发生 UUID 冲突。

## 操作流程

1. 确定外部文件或目录，以及相对于目标工程 `assets` 的目标目录。
2. 先验证导入计划：

   ```powershell
   node scripts/import-assets.mjs --project <工程目录> --source <外部文件或目录> --destination <assets相对目录> --dry-run
   ```

3. 执行导入：

   ```powershell
   node scripts/import-assets.mjs --project <工程目录> --source <外部文件或目录> --destination <assets相对目录>
   ```

4. 默认拒绝覆盖目标文件。只有用户明确要求更新已有资源时才使用 `--force`；此时保留已有 `.meta` 和 UUID。
5. 导入完成后让 Creator 刷新资源数据库，并检查控制台导入错误。

## 支持类型

- `.png`：`image`，生成 `Texture2D` 和 `SpriteFrame` 子资源。
- `.ts` / `.js`：`typescript` / `javascript`；JavaScript 按插件脚本导入。
- `.json` / `.txt`：`JsonAsset` / `TextAsset`。
- `.mp3`：`AudioClip`。
- `.effect` / `.mtl`：Effect / Cocos Material；`.mtl` 内容必须是 `cc.Material` JSON。
- `.skel + .atlas + .png`：Spine SkeletonData 资源组；脚本按同名 atlas 自动建立关联。

源目录中的 `.meta` 会被忽略。当前不支持的扩展名应停止并报告，不要猜测 importer。
