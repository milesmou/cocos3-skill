---
name: assemble-cocos-ui
description: 通过 Cocos Creator 3.8 编辑器拼装、重构和验收 UI 场景或 Prefab，覆盖 Canvas、UITransform、Widget、Layout、Sprite、Label、Mask、ScrollView、交互组件、事件绑定及嵌套 Prefab。适用于按设计稿搭界面、组合可复用控件、批量调整布局和检查多分辨率适配问题。
---

# 拼装 Cocos UI

先连接 `control-cocos-editor`，再组合使用 `manage-cocos-node`、`manage-cocos-components`、`manage-cocos-assets`、`manage-cocos-prefab-instance` 和 `manage-cocos-event-handlers`。详细约束见 [references/ui-rules.md](references/ui-rules.md)。

## 工作流

1. 等待编辑器就绪，保存当前上下文，并用 `inspectUILayout` 记录基线。
2. 确认目标 Canvas、设计分辨率策略、目标 Prefab URL、所需资源 UUID 和可复用 Prefab。
3. 先创建容器层级，再实例化可复用控件；节点创建后立即记录返回的 UUID，不依赖易歧义路径。
4. 按顺序配置：
   - 添加 `UITransform`，设置尺寸和锚点。
   - 添加 Sprite、Label、Mask 等视觉组件并绑定资源。
   - 设置子节点尺寸，再配置父容器 `Layout`。
   - 最后配置 `Widget`、Button/Toggle/ScrollView 和 EventHandler。
5. 对 Layout 调用 `updateLayout`，对 Widget 调用 `updateAlignment`；从内层到外层更新。
6. 运行 UI 专用校验，修复 error，并审查 warning：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script validateUI '["<根节点UUID>",{}]'
   ```

7. 保存场景或 Prefab，等待 AssetDB idle，重新检查布局树和关键资源引用。

## 查询布局

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script inspectUILayout '["<根节点UUID>",{"maxDepth":12}]'
```

输出包含尺寸、锚点、Widget、Layout、组件、SpriteFrame、字体、ScrollView content/view 和层级顺序。

## 拼装策略

- 重复按钮、页签、列表项和弹窗优先做成嵌套 Prefab；业务页面只保留实例覆盖和挂载节点。
- 在 Prefab 实例上遵守 Creator 的层级限制，不删除或移动来自源资源的节点。
- 资源操作使用 AssetDB；不要手写 `.meta` 或直接拼接 Prefab 对象表。
- 分阶段执行大界面，每一阶段重新查询并验证。失败时保留 dirty 上下文供撤销，不自动保存部分结果。
- Mask、ScrollView、Layout 和 Widget 的组合规则以 `references/ui-rules.md` 为准。
