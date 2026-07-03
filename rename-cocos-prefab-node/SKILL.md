---
name: rename-cocos-prefab-node
description: 使用 Node.js 修改 Cocos Creator 3.8 Prefab 中的节点名称。适用于按节点路径重命名根节点或子节点，并提供同级重名保护、根 Prefab 名称同步和 meta syncNodeName 同步。
---

# 修改 Cocos Prefab 节点名称

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
