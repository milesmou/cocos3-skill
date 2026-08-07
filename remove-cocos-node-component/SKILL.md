---
name: remove-cocos-node-component
description: 使用 Node.js 离线移除 Cocos Creator 3.8 Prefab 节点组件并重映射序列化 __id__。仅在 Creator 未运行且无法使用编辑器桥接时作为后备；编辑器可用时应使用在线组件管理。
---

# 移除 Cocos 节点组件

仅在目标工程的 Creator 未运行且无法使用编辑器桥接时执行。编辑器可用时，改用 `manage-cocos-components`。

使用技能内置脚本修改 Prefab。不要手动删除对象表条目或调整 `__id__`。

## 操作流程

1. 确定 Prefab、节点路径和组件类型。
2. 移除内置组件：

   ```powershell
   node scripts/remove-component.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --component Label
   ```

3. 使用相对于 `assets` 的脚本路径移除自定义组件：

   ```powershell
   node scripts/remove-component.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --script Property.ts
   ```

4. 若同一节点有多个同类型组件，使用 `--index` 选择一个，或使用 `--all` 全部移除。
5. 对复杂 Prefab 先使用 `--dry-run`。脚本发现其他对象仍引用待删组件时会拒绝修改；应先使用属性设置技能清空对应引用。
6. 验证目标节点 `_components`、对象表长度和全部 `__id__`。

为保持 UI 节点结构有效，禁止移除 `cc.UITransform`。脚本保留 Prefab `.meta` 文件及其他组件数据。
