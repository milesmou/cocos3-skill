---
name: manage-cocos-prefab-instance
description: 在 Cocos Creator 3.8 场景或 Prefab 编辑上下文中实例化 Prefab、检查嵌套与覆盖状态、从资源恢复、应用实例修改到资源，或解除 Prefab 关联。适用于 Prefab Asset 和 Prefab Instance 生命周期管理。
---

# 管理 Cocos Prefab 实例

修改前检查节点的 `__prefab__` 或 Scene Script 返回的 `prefab` 摘要。

## 实例化

1. 通过 AssetDB 查询 Prefab UUID。
2. 使用 `create-node`：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene create-node '[{"parent":"<父节点UUID>","assetUuid":"<Prefab UUID>","type":"cc.Prefab","snapshot":true}]'
   ```

3. 查询新节点并确认 `assetUuid` 和实例根状态。

## 恢复、应用、解除关联

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script prefabAction '["restore",{"uuid":"<实例根UUID>"},{}]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script prefabAction '["apply",{"uuid":"<实例根UUID>"},{}]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script prefabAction '["unlink",{"uuid":"<实例根UUID>"},{"removeNested":false}]'
```

应用和解除关联会影响多个对象。操作前保存当前上下文并确认目标是实例根。禁止创建 Prefab 自嵌套；默认保留嵌套 Prefab 关联，只有用户明确要求时才设置 `removeNested:true`。

Prefab 实例中的资源节点不能被删除或改变层级。需要定制界面时，优先添加挂载节点、挂载组件或属性覆盖；确实需要改变模板结构时进入 Prefab 编辑模式，或将修改应用到源 Prefab。不要用 Scene Script 直接绕过这些限制。

## 从节点创建或关联 Prefab

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script prefabAction '["create",{"uuid":"<节点UUID>"},{"url":"db://assets/prefabs/New.prefab"}]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script prefabAction '["link",{"uuid":"<节点UUID>"},{"assetUuid":"<Prefab UUID>"}]'
```

创建前确认目标 URL 不存在；关联前确认节点结构与目标 Prefab 兼容。
