---
name: remove-cocos-prefab-node
description: 使用 Node.js 离线删除 Cocos Creator 3.8 Prefab 节点子树并重映射序列化 __id__。仅在 Creator 未运行且无法使用编辑器桥接时作为后备；编辑器可用时应使用在线节点管理。
---

# 删除 Cocos Prefab 节点

仅在目标工程的 Creator 未运行且无法使用编辑器桥接时执行。编辑器可用时，改用 `manage-cocos-node`。

使用技能内置脚本删除节点。不要手动删除对象表记录或修改 `__id__`。

## 操作流程

1. 确定 Prefab 和相对于根节点的目标节点路径。
2. 对复杂 Prefab 先验证：

   ```powershell
   node scripts/remove-node.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --dry-run
   ```

3. 删除节点及其全部后代：

   ```powershell
   node scripts/remove-node.mjs --project <工程目录> --prefab <资源路径> --node <节点路径>
   ```

4. 验证父节点 `_children`、对象表长度以及全部 `__id__`。

禁止删除 Prefab 根节点。脚本通过可达性分析清理子树专属的节点、组件、PrefabInfo、CompPrefabInfo 和其他序列化对象；若子树节点或组件仍被子树外对象引用，则拒绝删除，应先使用属性设置技能清空引用。Prefab `.meta` 文件保持不变。
