---
name: validate-cocos-content
description: 验证 Cocos Creator 3.8 工程、当前场景或 Prefab 的节点组件关系、缺失脚本、对象表 __id__、资源 .meta、重复 UUID 和资源引用。适用于编辑前基线检查、修改后验收及编辑器无法启动时的离线诊断。
---

# 验证 Cocos 内容

编辑器及桥接可用时执行在线和离线验证；编辑器不可用时执行离线诊断，并明确在线状态未验证，不为完成诊断强制启动编辑器。在线结果反映当前编辑上下文，离线结果反映磁盘资源；未保存修改不会包含在离线结果中。

命令中的 `<技能根目录>` 替换为本技能集合所在目录的绝对路径（包含 `control-cocos-editor` 等子目录），`<工程目录>` 替换为目标 Cocos 工程绝对路径；保留路径引号，不依赖当前工作目录。

## 在线验证

先查询当前编辑上下文。仅对含 UI 的目标调用 validateUI，使用查询得到的 UI 根节点 UUID；多个 UI 根分别验证，无 UI 时跳过，不假定存在名为 Canvas 的节点。

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script validateScene '[]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script validateUI '["<UI根节点UUID>",{}]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene query-dirty '[]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request asset-db is-busy '[]'
```

必要时对关键资源调用 `query-missing-asset-info`、`query-asset-dependencies` 和 `query-asset-users`。

## 离线验证

```powershell
node "<技能根目录>/validate-cocos-content/scripts/validate-project.mjs" --project "<工程目录>"
node "<技能根目录>/validate-cocos-content/scripts/validate-project.mjs" --project "<工程目录>" --json
```

命令默认只向终端输出。若需要保存一次性验证报告，必须重定向到工程 `temp/validate-cocos-content/`，不得写入工程根目录或 `assets`。

错误包括无效对象表、越界 `__id__`、缺失 `.meta` 和重复 UUID。未解析的资源 UUID 作为警告，因为它可能来自 `internal` 或其他只读数据库。

修改前保存验证基线；修改后必须重新运行。存在 error 时不要继续批量修改或提交。
