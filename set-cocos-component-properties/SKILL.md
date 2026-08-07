---
name: set-cocos-component-properties
description: 使用 Node.js 离线设置 Cocos Creator 3.8 Prefab 组件的基础值、值类型及对象或资源引用。仅在 Creator 未运行且无法使用编辑器桥接时作为后备；编辑器可用时应使用在线组件管理。
---

# 设置 Cocos 组件属性

仅在目标工程的 Creator 未运行且无法使用编辑器桥接时执行。编辑器可用时，改用 `manage-cocos-components`。

使用技能内置脚本设置属性。应使用语义化引用描述符，不要手写 Prefab 对象 ID。

## 操作流程

1. 确定 Prefab、节点路径和组件。内置组件使用 `--component Label`；自定义组件使用相对于 `assets` 的脚本路径，例如 `--script Property.ts`。
2. 通过 `--values` 或 `--values-file` 传入 JSON 对象：

   ```powershell
   node scripts/set-properties.mjs --project <工程目录> --prefab <路径> --node <节点路径> --component Label --values '{"_string":"你好","_fontSize":24}'
   ```

3. 可在属性值或数组中使用以下描述符：

   - `{"$type":"Vec2","x":1,"y":2}`，也支持 `Vec3` 和 `Color`
   - `{"$node":"Panel/Title"}`
   - `{"$component":{"node":"Panel/Title","type":"Label"}}`
   - `{"$component":{"node":"Player","script":"Player.ts"}}`
   - `{"$asset":{"path":"textures/icon.png","type":"cc.Texture2D"}}`
   - `{"$asset":{"path":"data/readme.txt","type":"cc.TextAsset"}}`
   - `{"$asset":{"path":"data/config.json","type":"cc.JsonAsset"}}`
   - `{"$uuid":{"uuid":"...","type":"cc.SpriteFrame"}}`，用于引擎内部资源或已知子资源 UUID

4. 属性默认必须已经存在于序列化组件中。只有新增的自定义脚本属性确实尚未序列化时才显式使用 `--allow-new`。
5. 只有节点确实包含同类型重复组件时才使用 `--index`。
6. 对引用较多、风险较高的修改，先使用 `--dry-run` 验证。

禁止设置 `node`、`__prefab`、`__type__`、`_id` 等保留序列化关联字段。

`TextAsset`、`JsonAsset`、`AudioClip`、`Prefab` 和 `Material` 使用资源主 UUID。Texture 和 SpriteFrame 导入后可能生成子资源 UUID；脚本会自动解析 Texture2D。当图片没有可用的 SpriteFrame 子资源时，需要显式提供 subMeta 或 `$uuid`。
