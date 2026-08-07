---
name: rename-cocos-prefab-node
description: 使用 Node.js 离线修改 Cocos Creator 3.8 Prefab 节点名称，并同步根 Prefab 名称和 meta syncNodeName。仅在 Creator 未运行且无法使用编辑器桥接时作为后备；编辑器可用时应使用在线节点管理。
---

# 修改 Cocos Prefab 节点名称

仅在目标工程的 Creator 未运行且无法使用编辑器桥接时执行。编辑器可用时，改用 `manage-cocos-node`。

使用技能内置脚本改名，不要通过文本替换修改 Prefab。

## 操作流程

1. 确定 Prefab、当前节点路径和新名称。
2. 对复杂层级先验证：

   ```powershell
   node scripts/rename-node.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --name <新名称> --dry-run
   ```

3. 执行改名：

   ```powershell
   node scripts/rename-node.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --name <新名称>
   ```

4. 只有用户明确需要同级重名节点时才使用 `--allow-duplicate`。
5. 验证节点路径与名称。修改根节点时，还要验证 `cc.Prefab._name` 和 `.prefab.meta` 中的 `userData.syncNodeName`。

脚本只修改名称，不改变 Prefab 文件名、节点顺序、组件或对象引用。
