---
name: assemble-cocos-ui
description: 根据自然语言、UI 效果图、现有 Cocos Creator 3.8 Prefab、控制脚本或节点蓝图，分析工程结构并生成可执行的 Prefab 蓝图；按用户意图只交付规划，或继续通过 Creator 编辑器拼装、重构和验收 UI。提供对应美术资源时迭代到与效果图完全一致，缺少对应资源时只用纯色 Sprite 拼装大致效果。
---

# 规划与拼装 Cocos UI

用一个连续流程完成 UI 结构分析、Prefab 蓝图、编辑器拼装和验收。先形成符合目标工程的结构规格，再决定是否写入工程；不要用通用 UI 模板覆盖已有控制器、引用、资源和 Prefab 复用关系。

## 请求边界

- 用户只要求“分析、规划、节点树、蓝图”时，只完成规划阶段并交付蓝图，不修改工程。
- 用户要求“创建、制作、拼装、实现、重构、修复”时，先补全或校验蓝图，再在同一任务中继续执行和验收；已有制作授权时不额外等待确认。
- 用户给出完整蓝图时仍先检查工程契约。发现与脚本、资源或现有 Prefab 冲突时，按证据修正规格并记录原因。
- 只有会改变结构且无法合理推断的必要信息缺失时才询问用户。其余未知项标记为“待确认”或带依据的“估算”，继续不依赖该信息的工作。

始终读取 [references/blueprint-rules.md](references/blueprint-rules.md) 和 [references/ui-rules.md](references/ui-rules.md)。需要输出蓝图时使用 [references/blueprint-template.md](references/blueprint-template.md)。目标为 MyCookingGirl，或工程包含 `cocos3-toolkit` 的 `ReferenceCollector`、`MButton` 等组件时，还要读取 [references/my-cooking-girl-prefab-structure.md](references/my-cooking-girl-prefab-structure.md) 和 [references/my-cooking-girl-ui.md](references/my-cooking-girl-ui.md)。输入包含效果图时必须读取 [references/visual-fidelity.md](references/visual-fidelity.md)。

命令中的 `<技能根目录>` 替换为本技能集合所在目录的绝对路径，`<工程目录>` 替换为目标 Cocos 工程绝对路径；保留路径引号，不依赖当前工作目录。

## 规划阶段

1. 收集证据。
   - 读取用户提示、效果图尺寸、可见内容、资源范围、目标 Prefab 和控制脚本。
   - 有现成 Prefab 时，使用 `inspect-cocos-content` 或 `control-cocos-editor` 查询真实层级、组件、激活状态、资源和 Prefab 实例，不凭截图或文件名推断。
   - 读取工程设计分辨率、适配设置和同业务目录内容，从同职责 Prefab 中选择 1 至 3 个结构参考。不要把全工程统计直接当作单个界面的模板。
2. 判断 Prefab 职责：全屏窗口、弹窗、HUD、可复用控件、列表项、状态节点或纯视觉特效。由职责决定根尺寸、控制器、内容容器和适配方式。
3. 提取结构契约。
   - 标出根控制组件和每个嵌套控制器、`ReferenceCollector` 或同类收集器的作用域。
   - 搜索脚本使用的节点名、引用 key、按钮名、固定索引和子节点路径。这些名称和顺序属于代码接口。
   - 标出按钮事件归属、Switch 子节点顺序和默认状态、初始 inactive 节点、AnimationClip 目标路径和排序边界。
   - 区分本地序列化节点、嵌套 Prefab 实例、固定设计槽位、运行时模板和运行时生成内容。
4. 有效果图时锁定视觉基线：原图像素尺寸、方向、背景或透明通道、文本、语言、数据、滚动位置、状态组、动画时间点和安全区。逐项记录资源模式：
   - 已提供或能在工程中唯一定位对应资源：精确资源模式。
   - 对应资源缺失：纯色占位模式。
5. 按“根与控制边界 → 嵌套 Prefab → 功能容器 → 固定槽位与模板 → 叶子节点”的顺序规划。节点规格表是尺寸、位置、锚点、激活状态和组件属性的唯一事实来源；树只表达父子关系、渲染顺序、来源和组件概览。
6. 使用蓝图模板输出：分析摘要、结构证据、完整节点树、控制器和引用作用域、Prefab 实例、关键规格、重复内容、状态、视觉、交互、适配、拼装顺序及待确认项。
7. 执行蓝图一致性检查：
   - 本地节点路径唯一，父路径存在，命名遵循目标工程。
   - 引用 key 在所属收集器作用域唯一，嵌套边界未被跨越。
   - 每个按钮只归属一个控制器，按钮名与控制脚本一致。
   - Switch 直接子节点顺序与 `checkIndex` 一致；固定槽位未被误判为模板。
   - 嵌套 Prefab 没有被展平；实例资源、属性覆盖和运行时生成关系明确。
   - AnimationClip 路径、脚本路径查询、排序边界和默认激活状态完整。
   - Layout、Widget、动画与手动坐标在同一属性上没有控制冲突。
   - Mask 是 Content 的祖先；ScrollView 的 viewport、Content、方向和引用方式完整。

用户只要求分析或规划时，到此交付蓝图并结束。用户要求实际制作时继续执行以下阶段。

## 拼装阶段

8. 连接 `control-cocos-editor`，按需组合 `inspect-cocos-content`、`manage-cocos-node`、`manage-cocos-components`、`manage-cocos-assets`、`manage-cocos-prefab-instance` 和 `manage-cocos-event-handlers`。等待编辑器就绪，确认当前编辑的是目标场景或 Prefab，保存用户已有上下文，并用 `inspectUILayout` 记录基线。
9. 核对目标 Canvas、目标 Prefab URL、资源 UUID、可复用 Prefab 和实例边界。优先复用工程中承担相同职责的控件；确认对应资源不存在后才能创建纯色占位视觉。
10. 先创建根节点和控制边界，再实例化公共 Prefab，随后创建功能容器、固定槽位、模板和叶子节点。每次创建后记录返回 UUID；同级重名时只用 UUID 操作。
11. 按以下顺序配置：
    - 未指定 Layer 时，将新建 Prefab 根和自建后代设置为 `UI_2D`（`33554432`）；不要改写嵌套 Prefab 内部节点。
    - 添加 `UITransform`，设置尺寸、锚点和初始激活状态。
    - 添加 Sprite、Label、Mask 等视觉组件并绑定资源。正式资源必须原样使用。只有缺少对应资源的元素才使用中性纯白 SpriteFrame 配合 `Sprite.color` 形成纯色块，按效果图的大致轮廓、尺寸和层次拼装。
    - 设置子节点尺寸，再配置父容器 Layout。
    - 最后配置 Widget、项目交互组件、ScrollView 和必要的 EventHandler。
12. 恢复运行时契约：刷新节点收集器，核对按钮路由、Switch 默认状态、滚动 Content、模板显隐、动画路径、排序边界和业务组件引用。不要批量激活原本用于状态、模板或特效的禁用节点。
13. 从内层到外层调用 `Layout.updateLayout()` 和 `Widget.updateAlignment()`，再重新测量尺寸、边界和点击区域。
14. 运行 UI 校验。独立 Prefab 根本来不含 Canvas，使用 `assumeRenderRoot`：

   ```powershell
   node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script validateUI '["<根节点UUID>",{"assumeRenderRoot":true}]'
   ```

   在场景中校验 Canvas 子树时省略 `assumeRenderRoot`。修复所有 error；逐条判断 warning，只有与工程约定一致且运行结构完整时才能接受。
15. 保存场景或 Prefab，等待 AssetDB idle，再次检查实际节点树、布局、资源引用、控制器作用域和嵌套 Prefab 状态。

## 视觉验收阶段

16. 有效果图时，用 `cocos-prefab-preview` 或 `capture-cocos-runtime` 在相同像素尺寸和内容状态下生成真实 PNG，并查看叠图和差异图。
   - 在比较整图前先逐个核对所有 Label 的实际可见包围框、首字左边界、文本基线、字号、行高、字重和描边；不能只检查 Label 节点中心或 `UITransform` 矩形。
   - 任何文字节点的位置、字号或描边与效果图明显不符时，不得把视觉验收判定为完成。
17. 全部可见元素都有对应美术资源时执行严格比较。差异像素不为 0 就继续定位并迭代。
18. 存在缺失美术资源时，精确还原已有资源、文字和几何；只允许缺失资源对应节点保持纯色大致效果。交付时列出这些节点，不能将结果描述为与效果图完全一致。

## 查询、刷新和比较

查询布局：

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script inspectUILayout '["<根节点UUID>",{"maxDepth":12}]'
```

使用 `ReferenceCollector` 的工程中，新增、移动或重命名 `$` 节点后触发刷新，并检查私有 `_nodes`：

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script setComponentProperties '[{"uuid":"<控制节点UUID>"},{"type":"ReferenceCollector"},{"refresh":true}]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script inspectComponent '[{"uuid":"<控制节点UUID>"},{"type":"ReferenceCollector"},{"includePrivate":true,"properties":["_nodes"]}]'
```

精确资源模式下严格比较效果图和真实渲染图。差异图、叠图和报告写入目标工程的 `temp/assemble-cocos-ui/`：

```powershell
python "<技能根目录>/assemble-cocos-ui/scripts/compare-ui-images.py" --reference "<效果图绝对路径>" --actual "<真实渲染PNG绝对路径>" --diff "<工程目录>/temp/assemble-cocos-ui/diff.png" --overlay "<工程目录>/temp/assemble-cocos-ui/overlay.png" --report "<工程目录>/temp/assemble-cocos-ui/compare.json"
```

退出码为 0 且 `mismatchPixels` 为 0 才表示视觉一致。纯色占位模式可以使用差异图检查几何，但非零差异是预期结果。

## 完成标准

- 规划请求：蓝图包含结构证据、节点来源、控制器作用域、引用、复用、重复内容、状态、布局、适配和可执行拼装顺序，并通过一致性检查。
- 制作请求：实际节点树与蓝图一致；有证据支持的规格修正已记录。
- 业务脚本需要的节点名、组件和引用可解析，收集器作用域内没有重复 key。
- 交互使用工程既有组件和分发方式，点击区域不小于视觉区域，没有重复触发路径。
- Layout、Widget、Mask、ScrollView、Switch、动画、排序边界、嵌套 Prefab 和初始状态经过校验。
- 保存后的 Prefab 能重新打开，UI 校验无 error，关键 warning 有明确解释。
- 提供了全部对应美术资源时，真实渲染图与效果图尺寸、内容状态和 RGBA 像素完全相同，`mismatchPixels = 0`。
- 缺少部分或全部美术资源时，只有对应元素使用纯色 Sprite；界面结构、尺寸、位置、文字、交互和已有素材已验收，并列出纯色节点及待替换资源。

## 修改边界

- 在 Prefab 实例上遵守 Creator 层级限制，不删除或移动来自源资源的节点。优先使用属性覆盖和挂载节点；需要改变公共结构时编辑源 Prefab 或明确应用修改。
- 资源操作使用 AssetDB；不要手写 `.meta`、序列化对象 ID、脚本类型 ID 或 Prefab 对象表。
- 不得把整张效果图或大块截图直接作为覆盖 Sprite。可交互、可变化和可复用元素必须保持正确节点、组件和业务结构。
- 大界面按可独立验收的区域分阶段执行。失败时保留 dirty 上下文供撤销，不自动保存未通过校验的结果。
