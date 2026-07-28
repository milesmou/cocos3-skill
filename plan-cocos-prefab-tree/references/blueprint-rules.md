# Prefab 蓝图规则

## 目录

- 输入拆解
- 推荐渲染层
- 节点拆分
- 组件选择
- 复合控件
- 状态与动态内容
- 分辨率适配

## 输入拆解

先提取以下信息：

| 类别 | 需要识别的内容 |
| --- | --- |
| 界面 | 主界面、页面、弹窗、HUD、商店、背包、任务、结算等 |
| 基准 | 效果图分辨率、宽高比、工程设计分辨率 |
| 区域 | 背景、顶部栏、标题、内容、列表、按钮、提示、关闭区 |
| 变化 | 显隐、换图、变色、文字、缩放、动画 |
| 数据 | 动态文本、动态图片、列表项、进度、倒计时 |
| 交互 | Button、Toggle、滚动、分页、关闭遮罩 |
| 状态 | Loading、Content、Empty、Locked、Selected、Disabled 等 |
| 适配 | 固定边、居中、安全区、可伸缩区域、背景填充方式 |

无法确定且会改变节点结构的内容标记“待确认”。只影响微调的数值可先估算。

## 推荐渲染层

按同级节点从前到后排列：

1. 全屏或面板背景
2. 静态装饰
3. 主要内容
4. 操作控件
5. 状态提示、红点、浮层
6. 粒子、特效、引导

弹窗常用结构：

```text
Root
├── ModalMask
├── MainPanel
└── GuideLayer
```

仅当界面确实是弹窗时添加 ModalMask。说明遮罩颜色、透明度、是否点击关闭以及 `BlockInputEvents`。

## 节点拆分

满足任一条件时拆成独立节点：

- 需要独立显隐、换图、换色、改文字、缩放或播放动画。
- 需要独立点击区域。
- 是动态数据槽位或重复项模板。
- 承担 Layout、Widget、Mask、滚动、状态互斥或动画分组职责。
- 在渲染顺序上必须插入其他内容。

以下情况保持整体：

- 一张不会变化的完整装饰图。
- 拆分后没有布局、交互、状态或复用价值。
- 仅为视觉对齐而产生的空父节点。

建议层级深度不超过完成职责所需的最小值。不要为了追求浅层而破坏裁剪或状态边界。

## 组件选择

| 需求 | 首选组件 | 关键约束 |
| --- | --- | --- |
| 所有 UI 节点 | UITransform | 明确尺寸、锚点、本地位置 |
| 图片 | Sprite | 明确 Type、SizeMode、比例和动态换图 |
| 普通文字 | Label | 明确字号、行高、颜色、对齐、Overflow |
| 富文本 | RichText | 仅在确有混排、链接或富文本标记时使用 |
| 点击 | Button | 根节点作为热区，视觉内容放子节点 |
| 互斥选项 | Toggle + ToggleContainer | 明确默认选中和是否允许取消 |
| 自动排列 | Layout | 先设子节点尺寸，再更新 Layout |
| 裁剪 | Mask | 必须是被裁剪内容的祖先 |
| 滚动 | ScrollView | 明确 View、Content、方向、惯性与回弹 |
| 进度 | ProgressBar | 明确 barSprite、方向、总长；简单填充可用 FILLED Sprite |
| 翻页 | PageView | 只有逐页切换语义时使用 |
| 全屏/边缘适配 | Widget | 避免与同轴 Layout 或手动尺寸冲突 |
| 输入拦截 | BlockInputEvents | 弹窗或浮层按需要添加 |
| 动画 | Animation | 只有节点需独立控制的动画才添加 |

不使用 Cocos Creator 2.x 的废弃结构或属性。

## Sprite

- `SIMPLE`：固定尺寸图标或等比缩放图片。
- `SLICED`：可伸缩面板、按钮背景、气泡；给出建议九宫格边距和不可拉伸边缘。
- `TILED`：纹理可重复且效果图明确要求平铺。
- `FILLED`：进度、冷却或遮罩填充；说明填充方向和范围。
- 人物、图标、文字纹理和复杂装饰保持比例，不做非等比拉伸。
- 全屏背景明确选择裁剪填满、等比完整显示或允许的局部拉伸。

## Label

至少说明：

- 显示文字或明确占位文字
- FontSize、LineHeight、颜色
- HorizontalAlign、VerticalAlign、Overflow
- 描边与阴影
- 是否自动缩小、多行、动态更新

文字无法识别时使用 `标题文字`、`数量`、`倒计时`、`描述内容` 等占位，不虚构业务文案。

## 复合控件

### Button

```text
ConfirmButton [UITransform, Button]
├── ButtonBackground [UITransform, Sprite]
├── ButtonIcon [UITransform, Sprite]
└── ButtonLabel [UITransform, Label]
```

说明 Transition 和 normal/pressed/hover/disabled 视觉。移动端不依赖 hover。需要扩热区时扩大 Button 根节点，不拉伸视觉子节点。

### ScrollView

```text
RewardScrollView [UITransform, ScrollView]
└── View [UITransform, Mask]
    └── Content [UITransform, Layout]
        └── ItemTemplate [UITransform]
```

明确 Content 的 Layout 方向、间距、边距、锚点和初始位置。模板默认是否激活应与项目生成方式一致。

### Toggle

将 SelectedState/UnselectedState 作为属性变化或小型视觉节点处理。只有大范围结构差异时复制状态组。多个 Toggle 时使用 ToggleContainer，明确 `allowSwitchOff`。

## 状态与动态内容

- 页面级状态放在稳定的 `StateArea` 下并明确互斥关系。
- Loading、Empty、Content 只有在产品需求或效果图支持时添加；否则标记“建议项/待确认”。
- Claimable/Claimed 等业务状态不得仅凭常见模式虚构。
- 重复项用一个模板规格加数据数量说明。可复用且结构复杂的列表项建议单独 Prefab。
- 红点、倒计时、价格、数量、头像和远程图片标为动态内容。

## 分辨率适配

- 使用效果图尺寸作为视觉测量基准，同时记录工程设计分辨率。
- 全屏背景四边对齐；说明超宽/超长屏的裁剪或留白策略。
- 顶部区域优先 Top，底部操作区优先 Bottom，弹窗主体水平和垂直居中。
- 可伸缩内容区使用左右或四边约束；图标、按钮和字体通常保持固定尺寸。
- 刘海屏相关内容放入安全区容器或明确安全边距。
- 同一轴只确定一个主要控制者：
  - Layout 控制子节点排列；
  - Widget 控制相对父节点的边距/居中；
  - 手动坐标控制固定位置。
