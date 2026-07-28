---
name: manage-cocos-node
description: 通过 Cocos Creator 3.8 Scene 消息在当前场景或 Prefab 编辑上下文中查询、创建、复制、移动、重设父级、重排、变换和删除 2D/3D 节点。适用于通用节点层级和 Transform 编辑。
---

# 管理 Cocos 节点

优先使用 Scene 消息，让 Creator 记录撤销。节点路径只用于初次定位；修改请求使用 UUID。

## 常用操作

```powershell
# 创建节点
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene create-node '[{"parent":"<父节点UUID>","name":"New Node","snapshot":true}]'

# 复制节点
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene duplicate-node '["<节点UUID>"]'

# 改父级并保留世界变换
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene set-parent '[{"parent":"<新父节点UUID>","uuids":"<节点UUID>","keepWorldTransform":true}]'

# 删除
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene remove-node '[{"uuid":"<节点UUID>"}]'
```

## 设置属性

1. 调用 `query-node`。
2. 从结果中复制 `name`、`position`、`rotation`、`scale`、`active`、`layer` 或 `mobility` 的完整 dump。
3. 只修改 dump 的 `value`。
4. 调用：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene set-property '[{"uuid":"<节点UUID>","path":"position","dump":{"value":{"x":10,"y":20,"z":0}},"record":true}]'
   ```

批量操作前调用 `scene snapshot`，失败时调用 `snapshot-abort`。完成后保存并重新查询节点验证结果。
