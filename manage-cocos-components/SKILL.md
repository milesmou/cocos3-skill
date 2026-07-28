---
name: manage-cocos-components
description: 通过 Cocos Creator 3.8 编辑器查询可注册组件和节点组件，添加、设置、重置、启用、禁用或删除任意内置及自定义组件。适用于替代硬编码 Prefab 序列化默认值的通用组件管理。
---

# 管理 Cocos 组件

优先通过注册类名和组件 UUID 操作，不手写组件 `__type__`。

## 查询和添加

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene query-components '[]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script listComponents '[{"uuid":"<节点UUID>"}]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene create-component '[{"uuid":"<节点UUID>","component":"cc.Label"}]'
```

自定义组件必须先确认脚本已成功导入，并使用 `query-classes` 或 `query-components` 返回的注册类名。

## 设置属性

首选 `query-component` + `set-property`：

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene set-property '[{"uuid":"<组件UUID>","path":"string","dump":{"value":"标题"},"record":true}]'
```

引用和值类型复杂、公开 dump 无法表达时，使用 Scene Script 的 `setComponentProperties`。它支持 `$node`、`$component`、`$asset` 以及 `Vec2`、`Vec3`、`Quat`、`Color`、`Size` 描述符；使用后立即保存并验证。

## 重置和删除

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene reset-component '[{"uuid":"<组件UUID>"}]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene remove-component '[{"uuid":"<组件UUID>"}]'
```

删除前查询资源和其他组件引用。不要移除维持节点有效性所需的组件。
