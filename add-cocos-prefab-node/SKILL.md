---
name: add-cocos-prefab-node
description: 使用 Node.js 向现有 Cocos Creator 3.8 Prefab 添加空 UI 子节点。适用于在 Prefab 根节点或指定节点路径下创建、添加或插入空节点，同时保留已有序列化数据。
---

# 添加 Cocos Prefab 节点

使用技能内置脚本修改 Prefab。不要手动调整序列化 `__id__` 引用或 Prefab fileId。

## 操作流程

1. 确认目标是 Cocos Creator 3.8 工程，并确定相对于 `assets` 的 Prefab 路径。
2. 运行：

   ```powershell
   node scripts/add-node.mjs --project <工程目录> --prefab <资源相对路径> --name <节点名称> [--position <x,y>] [--size <宽度,高度>] [--anchor <x,y>]
   ```

3. 省略 `--parent` 时添加到根节点下。若要指定后代节点，传入以斜杠分隔的名称路径，例如 `--parent Panel/Content`；路径开头的根节点名称可以省略。位置默认为 `0,0`，尺寸默认为 `100,100`，锚点默认为 `0.5,0.5`。未特意指定 Layer 时，新节点使用 `UI_2D`（`33554432`）。
4. 只有用户明确需要同级重名节点时才使用 `--allow-duplicate`。
5. 验证父节点 `_children` 中存在新节点引用、新节点包含 `cc.UITransform`，并具有有效的 Prefab 关联记录。

脚本保留 Prefab 的 `.meta` 文件和已有序列化对象。新记录追加到对象表末尾，因此已有 `__id__` 引用保持稳定。
