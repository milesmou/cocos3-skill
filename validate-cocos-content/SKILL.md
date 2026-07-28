---
name: validate-cocos-content
description: 验证 Cocos Creator 3.8 工程、当前场景或 Prefab 的节点组件关系、缺失脚本、对象表 __id__、资源 .meta、重复 UUID 和资源引用。适用于编辑前基线检查、修改后验收及编辑器无法启动时的离线诊断。
---

# 验证 Cocos 内容

同时执行在线和离线验证；在线结果用于确认引擎反序列化状态，离线结果用于覆盖全部资源。

## 在线验证

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script validateScene '[]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script validateUI '["Canvas",{}]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene query-dirty '[]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request asset-db is-busy '[]'
```

必要时对关键资源调用 `query-missing-asset-info`、`query-asset-dependencies` 和 `query-asset-users`。

## 离线验证

```powershell
node scripts/validate-project.mjs --project <工程目录>
node scripts/validate-project.mjs --project <工程目录> --json
```

错误包括无效对象表、越界 `__id__`、缺失 `.meta` 和重复 UUID。未解析的资源 UUID 作为警告，因为它可能来自 `internal` 或其他只读数据库。

修改前保存验证基线；修改后必须重新运行。存在 error 时不要继续批量修改或提交。
