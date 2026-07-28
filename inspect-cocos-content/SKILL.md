---
name: inspect-cocos-content
description: 只读检查 Cocos Creator 3.8 当前场景或 Prefab 的节点树、组件、属性、Prefab 关联，以及 AssetDB 中的资源信息、依赖和引用者。适用于修改前定位 UUID、分析层级、查找丢失引用或输出结构摘要。
---

# 检查 Cocos 内容

使用 `control-cocos-editor` 的 CLI，只执行只读请求。

## 场景和 Prefab

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script inspectTree '[{"maxDepth":8,"components":true}]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene query-node '["<节点UUID>"]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene query-component '["<组件UUID>"]'
```

需要查看组件运行时属性时：

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script inspectComponent '["Canvas/Button",{"type":"cc.Button"},{"includePrivate":false}]'
```

## 资源

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db query-asset-info '["db://assets/ui/button.prefab"]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db query-asset-meta '["db://assets/ui/button.png"]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db query-asset-dependencies '["<资源UUID>","all"]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db query-asset-users '["<资源UUID>","all"]'
```

先报告定位到的 UUID、路径和歧义，再进行任何后续修改。同级重名节点必须改用 UUID。
