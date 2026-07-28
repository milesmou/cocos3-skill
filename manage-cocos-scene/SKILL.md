---
name: manage-cocos-scene
description: 通过 Cocos Creator 3.8 编辑器消息创建、查询、打开、保存、关闭和配置场景资源。适用于管理 .scene、切换编辑上下文、修改场景根属性、检查 dirty 状态并安全保存。
---

# 管理 Cocos 场景

先使用 `control-cocos-editor` 连接 Creator，再执行场景操作。

## 工作流

1. 查询场景资源：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db query-assets '[{"pattern":"db://assets/**/*.scene"}]'
   ```

2. 使用资源 UUID 打开场景：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene open-scene '["<场景UUID>"]'
   ```

3. 等待 `query-is-ready` 返回 `true`，再检查节点树和场景属性。
4. 使用 `query-node` 获取场景根 dump；修改属性时复用属性 dump，并通过 `set-property` 设置，传入 `record:true`。
5. 查询 dirty 状态并保存：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene query-dirty '[]'
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene save-scene '[]'
   ```

## 创建场景资源

优先通过 AssetDB 创建 Creator 识别的场景模板或在编辑器中新建并保存。不要手写 `.scene` 对象表。创建后重新查询 AssetDB，以返回的 UUID 为准。

切换或关闭场景前必须检查 dirty 状态；未经用户授权不要丢弃未保存修改。
