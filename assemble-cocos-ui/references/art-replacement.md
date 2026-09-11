# 已拼装 UI 的正式美术换装

本流程用于把纯色占位、临时字体、临时状态图或临时视觉 Prefab 替换为正式资源。目标是在允许视觉几何调整的同时保持节点、引用、事件、状态、动画和运行时生成关系稳定。只有资源本身无法适配既有结构时才改变结构，并把该变化视为重构而不是普通换装。

## 1. 建立换装基线

修改前保存当前 Prefab 或场景，并等待 AssetDB idle。对目标子树记录：

- 节点 UUID、完整路径、父子顺序、激活状态和 Layer。
- UITransform 的尺寸、锚点、位置和缩放，以及 Layout、Widget、Mask、ScrollView、ProgressBar 控制的属性。
- Sprite 的 SpriteFrame、color、type、sizeMode、trim 相关表现、fill 参数和材质。
- Label 的字体来源、useSystemFont、fontFamily、字号、行高、Overflow、对齐、描边及可见字形包围框。
- Button、Toggle、项目 Switch 的 transition target、状态资源、直接子节点顺序和默认状态。
- 控制组件、ReferenceCollector、EventHandler、AnimationClip 路径、嵌套 Prefab 实例及属性覆盖。

用 `inspectUILayout` 和组件检查结果保存机器可核对的基线；有效果图时还要保存同尺寸、同状态的真实渲染 PNG。不要以编辑器场景截图代替运行结果。

## 2. 生成替换清单

为每个待换元素记录以下映射，不依赖“看起来相近”的文件名猜测：

| 目标节点或组件 UUID | 当前资源 | 正式资源 URL/UUID | 类型 | 几何策略 | 状态/动态用途 | 证据 |
| --- | --- | --- | --- | --- | --- | --- |

类型包括 SpriteFrame、Font、Prefab、材质或按钮状态资源。几何策略必须明确为以下一种：

- **保持节点几何**：图标、头像、人物等使用既有 UITransform，通常保持比例；替换时不得让 RAW/TRIMMED 自动改写节点尺寸。
- **采用素材几何**：设计明确要求使用原始尺寸或 trim 偏移；记录替换前后尺寸，并同步检查承载素材上的文字、图标和热区。
- **九宫格适配**：面板、按钮底板或气泡使用 SLICED；先确认 SpriteFrame 的 border，再保持目标 UITransform 尺寸。
- **结构不兼容**：正式资源需要多个独立状态、骨骼动画、Mask、Prefab 或可交互子元素，无法由原节点承载。停止普通换装，先修订蓝图和运行时契约，再按重构流程执行。

按钮、Toggle、Switch 和动态换图节点必须把所有状态或运行时资源列全，不能只替换当前可见状态。

## 3. 导入和绑定

通过 AssetDB 导入或更新资源，等待 idle 后重新查询 URL、类型、UUID、SpriteFrame 子资源和 meta 设置。除非用户明确要求更新既有资源，不覆盖同名资源；不要手写 `.meta`。

按清单使用节点 UUID 和组件 UUID 定位。普通换装只允许修改视觉组件及其必要几何属性，不执行以下操作：

- 不重命名、移动、删除业务节点，不改变同级顺序或默认激活状态。
- 不删除或重新创建 Button、ReferenceCollector、控制脚本、EventHandler、Layout、Widget、Mask、ScrollView 等功能组件。
- 不展开或断开嵌套 Prefab，不把实例内部节点复制为本地节点。

绑定正式 SpriteFrame 时同时处理 `Sprite.color`、透明度、type、sizeMode、材质和 fill 参数。占位色只用于纯白占位图的染色；正式彩色资源默认恢复不染色的白色，除非效果图或工程事实要求着色。先确定几何策略，再决定是否改变 UITransform，不能让换图副作用隐式改尺寸。

绑定正式字体时切换到字体资源并清除系统字体回退语义；重新核对字号、行高、Overflow、基线和字形包围框。不要用移动 Label 节点掩盖字体度量或对齐配置错误。

## 4. 更新派生布局

替换完成后从内层到外层调用 `Layout.updateLayout()` 和 `Widget.updateAlignment()`，重新测量：

- 承载素材及其覆盖文字、图标、徽标的相对位置。
- ScrollView viewport、Content、Mask 和滚动初始位置。
- 按钮根热区；热区不得因视觉图变小，也不得小于最终可见区域。
- SLICED、FILLED、SPRITE_STENCIL 和动态换图节点的所有状态。

只有受新素材固有尺寸、留白、border 或字体度量影响的节点才能调整几何。调整父容器后，必须再次更新并检查全部后代。

## 5. 功能回归

保存前后都执行结构和运行时契约检查。至少确认：

- 节点路径、父子顺序、激活状态、控制器作用域和 ReferenceCollector key 与基线一致。
- Button/EventHandler 路由唯一且可解析；normal、pressed、hover、disabled 等实际使用状态资源完整。
- Switch 直接子节点顺序和 `checkIndex` 不变；Toggle、ScrollView、模板和动态挂点仍有效。
- AnimationClip 目标路径、嵌套 Prefab 实例关系和属性覆盖未丢失。
- 无 missing asset、组件脚本丢失、非正尺寸热区或新增的结构校验 error。

`validateUI` 通过只代表结构有效。界面依赖业务数据、动态换图、适配、动画或交互时，还必须用 `capture-cocos-runtime` 在代表性状态下做冒烟验证；纯静态 Prefab 才可只用 `cocos-prefab-preview`。

## 6. 视觉验收与失败处理

有效果图时按 [visual-fidelity.md](visual-fidelity.md) 在相同尺寸、数据和状态下比较真实渲染。替换后仍有占位资源时继续按混合模式验收；全部正式资源齐全后，只有 `mismatchPixels = 0` 才能报告完全一致。

保存、等待 AssetDB idle、重新打开目标 Prefab，再重复资源引用、布局和结构检查，避免只验证内存状态。若出现无法解释的功能契约变化、丢失引用或资源类型不兼容：

1. 停止继续批量换装，不用后续调整掩盖错误。
2. 保留未通过状态供撤销；若修改已经保存，使用编辑器可追踪的反向属性修改恢复本轮映射，不删除或覆盖用户资源。
3. 报告失败节点、正式资源、基线差异和需要转为重构的原因。

交付时列出成功替换项、仍然占位项、允许的几何变化、功能回归结果、运行时验证状态和视觉比较结果。没有运行时冒烟证据时，不将动态或交互界面描述为“功能完全稳定”。
