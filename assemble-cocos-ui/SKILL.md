---
name: assemble-cocos-ui
description: 根据明确的节点蓝图或执行规格，通过 Cocos Creator 3.8 编辑器拼装、重构和验收 UI 场景或 Prefab；提供效果图和美术资源时迭代到完全一致，未提供对应美术资源时只用纯色 Sprite 拼装大致效果。写入前核对目标工程的控制脚本、节点绑定、交互组件、复用 Prefab 和适配约定。只有自然语言需求或设计稿而没有蓝图时，先使用 plan-cocos-prefab-tree。
---

# 拼装 Cocos UI

本技能负责把蓝图落实为可运行、可接入业务代码的 UI。输入没有明确节点蓝图或执行规格时，先使用 `plan-cocos-prefab-tree`；已有制作授权时，规划完成后直接继续拼装。

先连接 `control-cocos-editor`，再按需组合 `inspect-cocos-content`、`manage-cocos-node`、`manage-cocos-components`、`manage-cocos-assets`、`manage-cocos-prefab-instance` 和 `manage-cocos-event-handlers`。始终读取 [references/ui-rules.md](references/ui-rules.md)。目标为 MyCookingGirl，或工程包含 `cocos3-toolkit` 的 `ReferenceCollector`、`MButton` 等组件时，还要读取 [references/my-cooking-girl-ui.md](references/my-cooking-girl-ui.md)。输入包含效果图时，还必须读取 [references/visual-fidelity.md](references/visual-fidelity.md)，先判定每个视觉元素使用精确素材还是纯色占位，再采用对应的完成门槛。

命令中的 `<技能根目录>` 替换为本技能集合所在目录的绝对路径（包含 `control-cocos-editor` 等子目录），`<工程目录>` 替换为目标 Cocos 工程绝对路径；保留路径引号，不依赖当前工作目录。

## 工作流

1. 等待编辑器就绪，确认当前编辑的是目标场景或 Prefab。保存用户已有上下文，并用 `inspectUILayout` 记录目标根节点的基线。
2. 在写入前建立工程契约：
   - 读取设计分辨率和适配设置。
   - 检查同模块、同类型的相邻界面，以及蓝图准备复用的公共 Prefab。
   - 定位目标根节点上的业务组件及其脚本，核对 `rc.get(...)`、按钮分发方法、序列化字段、状态切换和动态列表模板。
   - 把脚本使用的节点名、组件类型、子节点顺序和 Prefab 引用视为接口。蓝图与接口冲突时，先按证据修正规格，不要为了统一风格重命名仍被代码引用的节点。
3. 有效果图时先锁定对比基线：原图像素尺寸、方向、背景/透明通道、显示文本、语言、数据、滚动位置、状态组、动画时间点和安全区。将可见元素的边界、中心、间距、颜色、字体和渲染顺序写入蓝图。逐项记录是否提供了对应美术资源；提供资源的元素进入精确还原模式，未提供资源的元素进入纯色占位模式。
4. 核对目标 Canvas、目标 Prefab URL、资源 UUID、可复用 Prefab 和嵌套边界。优先复用工程中已经承担相同职责的控件；确认没有可用资源后才能创建占位视觉。
5. 先创建容器和状态边界，再实例化可复用 Prefab，最后创建叶子节点。节点创建后立即记录返回的 UUID；同级重名时只用 UUID 操作。
6. 按以下顺序配置：
   - 未指定 Layer 时，将新建 Prefab 的根节点和自建后代统一设置为 `UI_2D`（`33554432`）；不要改写嵌套 Prefab 的内部节点。
   - 添加 `UITransform`，设置尺寸和锚点。
   - 添加 Sprite、Label、Mask 等视觉组件并绑定资源。已提供或明确指定的美术资源必须原样使用，不得换成纯色或相近素材。只有未提供对应美术资源的元素才允许使用中性纯白 SpriteFrame 配合 `Sprite.color` 形成纯色块，并按效果图的大致轮廓、尺寸和层次拼装；不要使用带图案的默认图或相似美术素材冒充原资源。
   - 设置子节点尺寸，再配置父容器 `Layout`。
   - 最后配置 `Widget`、项目交互组件、ScrollView 和必要的 EventHandler。
7. 恢复项目运行时契约：刷新节点收集器，核对按钮路由、Switch 默认状态、滚动 Content、模板初始显隐和业务组件引用。不要批量激活原本用于状态、模板或特效的禁用节点。
8. 从内层到外层调用 `Layout.updateLayout()` 和 `Widget.updateAlignment()`，再重新测量尺寸、边界和点击区域。
9. 运行 UI 校验。独立 Prefab 根节点本来不含 Canvas，使用 `assumeRenderRoot` 避免无意义的层级警告：

   ```powershell
   node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script validateUI '["<根节点UUID>",{"assumeRenderRoot":true}]'
   ```

   在场景中校验 Canvas 子树时省略 `assumeRenderRoot`。修复所有 error；逐条判断 warning，只有与工程既有约定一致且运行结构完整时才能接受。
10. 保存场景或 Prefab，等待 AssetDB idle，再次检查布局树、关键资源引用和嵌套 Prefab 状态。
11. 有效果图时必须进入视觉闭环：用 `cocos-prefab-preview` 或 `capture-cocos-runtime` 在相同像素尺寸和内容状态下生成真实 PNG，并查看叠图和差异图。全部可见元素均有对应美术资源时执行严格比较，差异像素不为 0 就继续迭代。存在未提供美术资源的元素时，精确还原已有资源、文字和几何，只允许缺失资源对应的节点保持纯色大致效果；交付时列出这些节点，不能把该结果描述为与效果图完全一致。

## 查询与刷新

查询布局：

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script inspectUILayout '["<根节点UUID>",{"maxDepth":12}]'
```

输出包含尺寸、锚点、Widget、Layout、组件、SpriteFrame、字体、ScrollView content/view 和层级顺序。

使用 `ReferenceCollector` 的工程中，新增、移动或重命名 `$` 节点后触发收集器刷新，并检查私有 `_nodes` 中的 key 与节点引用：

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script setComponentProperties '[{"uuid":"<控制节点UUID>"},{"type":"ReferenceCollector"},{"refresh":true}]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script inspectComponent '[{"uuid":"<控制节点UUID>"},{"type":"ReferenceCollector"},{"includePrivate":true,"properties":["_nodes"]}]'
```

精确还原模式下严格比较效果图和真实渲染图。差异图、叠图和报告必须写入目标工程的 `temp/assemble-cocos-ui/`：

```powershell
python "<技能根目录>/assemble-cocos-ui/scripts/compare-ui-images.py" --reference "<效果图绝对路径>" --actual "<真实渲染PNG绝对路径>" --diff "<工程目录>/temp/assemble-cocos-ui/diff.png" --overlay "<工程目录>/temp/assemble-cocos-ui/overlay.png" --report "<工程目录>/temp/assemble-cocos-ui/compare.json"
```

命令退出码为 0 且报告中的 `mismatchPixels` 为 0 才表示视觉一致。纯色占位模式仍可使用差异图定位布局，但非零差异是预期结果，不能据此宣称精确还原。

## 完成标准

- 实际节点树与蓝图一致；任何有证据支持的规格修正都已写入交付说明。
- 业务脚本需要的节点名、组件和引用可解析，`ReferenceCollector` 作用域内没有重复 key。
- 交互使用工程既有组件和分发方式，点击区域不小于视觉区域，没有重复触发路径。
- Layout、Widget、Mask、ScrollView、Switch、嵌套 Prefab 和初始激活状态经过校验。
- 保存后的 Prefab 能重新打开，UI 校验无 error，关键 warning 有明确解释。
- 提供了全部对应美术资源时，真实渲染图与效果图尺寸、内容状态和 RGBA 像素完全相同，严格比较结果 `mismatchPixels = 0`。
- 未提供部分或全部美术资源时，只有对应缺失元素使用纯色 Sprite；界面结构、尺寸、位置、文字、交互和已有素材已验收，并在交付中列出纯色节点及待替换资源。

## 修改边界

- 在 Prefab 实例上遵守 Creator 的层级限制，不删除或移动来自源资源的节点。优先使用属性覆盖和挂载节点；需要改变模板结构时编辑源 Prefab 或明确应用修改。
- 资源操作使用 AssetDB；不要手写 `.meta`、序列化对象 ID、脚本类型 ID 或 Prefab 对象表。
- 不得把整张效果图或大块截图直接作为覆盖 Sprite 来伪造一致；可交互、可变化和可复用元素仍需保持正确节点、组件和业务结构。
- 大界面按可独立验收的区域分阶段执行。失败时保留 dirty 上下文供撤销，不自动保存未通过校验的部分结果。
