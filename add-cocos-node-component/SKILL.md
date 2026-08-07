---
name: add-cocos-node-component
description: 使用 Node.js 离线向 Cocos Creator 3.8 Prefab 节点添加内置或自定义 TypeScript 组件。仅在 Creator 未运行且无法使用编辑器桥接时作为后备；编辑器可用时应使用在线组件管理。
---

# 添加 Cocos 节点组件

仅在目标工程的 Creator 未运行且无法使用编辑器桥接时执行。编辑器可用时，改用 `manage-cocos-components`。

使用技能内置脚本修改 Prefab。自定义脚本类型必须根据其 `.meta` UUID 计算，不要将类名直接用作序列化 `__type__`。

## 操作流程

1. 确定 Prefab 和相对于根节点的目标节点路径。
2. 检查目标节点的 `_components`，将组件引用解析到对象表中的 `__type__`。添加自定义组件时，先根据脚本 `.meta` UUID 计算序列化类型，再执行相同检查。
3. 如果节点已有相同 `__type__` 的组件，停止添加并复用现有组件；需要修改时设置现有组件属性。不要重复添加同类型组件。
4. 仅当目标节点没有该组件时，添加支持的内置组件：

   ```powershell
   node scripts/add-component.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --component Sprite
   ```

5. 使用相对于 `assets` 的脚本路径添加自定义 TypeScript 组件：

   ```powershell
   node scripts/add-component.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --script <脚本路径>
   ```

6. 可通过 `--properties '<JSON对象>'` 覆盖序列化默认值。除非明确掌握 Creator 对象引用的正确格式，否则不要用该参数设置对象引用。
7. 验证节点 `_components` 引用、组件的 `node` 反向引用以及 `cc.CompPrefabInfo` 关联，并确认同类型组件只有一个。

`--node` 路径开头的根节点名称可以省略。运行 `--list-components` 可查看支持的内置组件。`Sprite` 和 `SpriteRenderer` 默认使用引擎的 `default_sprite_splash.png` SpriteFrame。复合控件使用安全的空引用创建；需要时再配置 `content`、`handle`、`barSprite`、Label、Camera 或 CheckMark 等字段。
