---
name: add-cocos-node-component
description: 使用 Node.js 向现有 Cocos Creator 3.8 Prefab 节点添加常用内置 2D、UI、渲染、媒体或自定义 TypeScript 组件。适用于挂载、添加或配置组件，同时保留序列化对象引用。
---

# 添加 Cocos 节点组件

使用技能内置脚本修改 Prefab。自定义脚本类型必须根据其 `.meta` UUID 计算，不要将类名直接用作序列化 `__type__`。

## 操作流程

1. 确定 Prefab 和相对于根节点的目标节点路径。
2. 添加支持的内置组件：

   ```powershell
   node scripts/add-component.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --component Sprite
   ```

3. 使用相对于 `assets` 的脚本路径添加自定义 TypeScript 组件：

   ```powershell
   node scripts/add-component.mjs --project <工程目录> --prefab <资源路径> --node <节点路径> --script <脚本路径>
   ```

4. 可通过 `--properties '<JSON对象>'` 覆盖序列化默认值。除非明确掌握 Creator 对象引用的正确格式，否则不要用该参数设置对象引用。
5. 只有用户明确要求添加重复组件时才使用 `--allow-duplicate`。
6. 验证节点 `_components` 引用、组件的 `node` 反向引用以及 `cc.CompPrefabInfo` 关联。

`--node` 路径开头的根节点名称可以省略。运行 `--list-components` 可查看支持的内置组件。`Sprite` 和 `SpriteRenderer` 默认使用引擎的 `default_sprite_splash.png` SpriteFrame。复合控件使用安全的空引用创建；需要时再配置 `content`、`handle`、`barSprite`、Label、Camera 或 CheckMark 等字段。
