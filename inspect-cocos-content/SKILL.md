---
name: inspect-cocos-content
description: 只读获取 Cocos Creator 3.8 工程设计分辨率和适配设置，检查当前场景或 Prefab 的节点树、组件、属性、Prefab 关联，以及 AssetDB 中的资源信息、依赖和引用者。适用于查询工程分辨率、修改前定位 UUID、分析层级、查找丢失引用或输出结构摘要。
---

# 检查 Cocos 内容

工程设计分辨率直接读取配置文件；场景、Prefab 和资源查询使用 `control-cocos-editor` 的 CLI，只执行只读请求。

命令中的 `<技能根目录>` 替换为本技能集合所在目录的绝对路径（包含 `control-cocos-editor` 等子目录），`<工程目录>` 替换为目标 Cocos 工程绝对路径；保留路径引号，不依赖当前工作目录。

## 快速获取工程设计分辨率

直接读取目标工程的 `settings/v2/packages/project.json`，取 `general.designResolution` 中的 `width`、`height`、`fitWidth` 和 `fitHeight`。无需连接编辑器，也无需扫描场景、Prefab、构建产物或整个工程。

```powershell
$projectConfigPath = Join-Path "<工程目录>" "settings/v2/packages/project.json"
$projectConfig = Get-Content -LiteralPath $projectConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$projectConfig.general.designResolution | Select-Object width, height, fitWidth, fitHeight
```

报告宽 × 高、两个适配开关及配置来源。每次查询读取当前文件，不将参考文档里的历史值、Prefab 根尺寸、预览窗口尺寸或构建平台的 `resolution` 当作工程设计分辨率。文件不存在或字段缺失时，明确报告该情况，再针对目标工程版本查找配置来源，不猜测默认值。

## 场景和 Prefab

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script inspectTree '[{"maxDepth":8,"components":true}]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene query-node '["<节点UUID>"]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene query-component '["<组件UUID>"]'
```

需要查看组件运行时属性时：

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script inspectComponent '["Canvas/Button",{"type":"cc.Button"},{"includePrivate":false}]'
```

## 资源

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request asset-db query-asset-info '["db://assets/ui/button.prefab"]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request asset-db query-asset-meta '["db://assets/ui/button.png"]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request asset-db query-asset-dependencies '["<资源UUID>","all"]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request asset-db query-asset-users '["<资源UUID>","all"]'
```

先报告定位到的 UUID、路径和歧义，再进行任何后续修改。同级重名节点必须改用 UUID。
