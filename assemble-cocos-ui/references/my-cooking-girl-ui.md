# MyCookingGirl UI 拼装约定

本参考用于 `D:/Workspace/XiaoGuan/program/trunk/MyCookingGirl`，也适用于保留同一套 `cocos3-toolkit` UI 基类的工程。以下结论来自 `assets/bundles/dynamic/uiPrefab` 的 77 个 Prefab 快照；数量用于说明惯例强度，不是必须维持的固定指标。

## 工程基准

- Creator 版本为 3.8.8。
- 设计分辨率是 750 × 1334，`fitWidth: true`、`fitHeight: false`。
- 52 个窗口 Prefab 的根节点为 750 × 1334；小控件和列表项保留自身尺寸。不要把所有 Prefab 都强制改成全屏。
- Prefab 根节点名与文件名一致。根节点通常挂 `UITransform`、业务控制组件和 `ReferenceCollector`，部分窗口另有 `Animation` 或 `UIOpacity`。
- 展开的 UI 节点使用 `UI_2D`。离线读取时，嵌套 Prefab 的根存根可能只有父节点和 Prefab 信息，不能因此判定它缺少 `UITransform` 或 Layer。

## 节点绑定是代码接口

项目使用 `ReferenceCollector` 收集控制节点子树中以 `$` 开头的节点。脚本通过 `this.rc.get("Key", Type)` 获取去掉 `$` 后的 key。

- 只有脚本需要直接访问的节点才加 `$`；纯装饰节点保持普通名称。
- `$ItemNum` 对应 key `ItemNum`，大小写必须与脚本一致。不要顺手修正 `tittle`、`seting`、`stroy` 等已经进入脚本或资源路径的历史拼写。
- 同一 `ReferenceCollector` 作用域中，去掉 `$` 并 trim 后的 key 必须唯一。
- 子节点上出现另一个 `ReferenceCollector` 时形成新的收集边界。外层控制器不能读取该边界内部的 `$` 节点；嵌套控制器只管理自己的子树。
- 新增、移动或重命名 `$` 节点后必须触发 `ReferenceCollector.refresh`，再检查 `_nodes`。只修改节点名而不刷新会留下旧引用。

业务脚本继承 `MUIComponent` 时，`@requireComponent(ReferenceCollector)` 会要求同节点存在收集器。挂载业务组件后仍要确认收集器实际存在并已刷新。

## 按钮与事件

项目界面使用 `MButton`，现有样本中有 365 个，未使用原生 `cc.Button`。新增普通按钮时沿用以下默认值，除非相邻界面或需求明确不同：

- `transition = SCALE`，`zoomScale = 0.9`，`duration = 0.1`。
- `defaultAudio = true`，`cooldown = 0.2`。
- `_target` 允许为空，此时沿用组件对自身节点的默认目标。
- 长按、连击、快速响应和异形点击默认关闭；只有需求明确时启用。异形按钮还必须配置 `PolygonCollider2D`。

`MUIComponent.__preload()` 会扫描当前控制范围内的 `MButton`，并把点击转发给 `onClickButton(btnName, btn)`。扫描遇到嵌套 `MUIComponent` 会停止，避免父子控制器重复处理。

- 控制脚本已经覆写 `onClickButton` 时，以稳定的按钮节点名分发，不再添加序列化 `clickEvents`。
- 只有现有脚本明确依赖独立 handler，或蓝图明确要求 Inspector 回调时才创建 EventHandler。
- 不要同时保留自动分发和指向同一逻辑的 EventHandler，否则一次点击可能执行两次。
- 修改按钮名之前搜索 `onClickButton` 的 `switch`、字符串比较和资源中的旧 EventHandler。

## 状态与动态内容

- 项目大量使用 `Switch`。它按直接子节点索引维护 `checkIndex`；改变子节点顺序会改变状态语义。脚本使用 `updateCheckByName` 时还要保持子节点名稳定。
- 77 个 Prefab 中有 322 个初始禁用节点，主要用于互斥状态、列表模板、引导和特效。拼装时保留蓝图与相邻界面的初始状态，不做全树激活。
- 重复数据项保留一个模板或少量设计样本，运行时数量交给脚本生成。列表项自身需要业务组件、`ReferenceCollector` 和所需的 `$` 子节点。
- `SortingNode2D` 用于一次性给子树的渲染器设置排序，`SortingPrevent`/`SortingGroup2D` 是遍历边界。遇到这些组件时保留边界，不要给内部每个 Sprite 随意添加或改写 `Sorting2D`。

## 布局、滚动与适配

- 现有 Layout 以横向、纵向和网格容器为主，绝大多数通过 `resizeMode = CONTAINER` 让容器跟随子项。先确定子项尺寸，再更新内层 Layout，最后更新外层。
- Sprite 以 SIMPLE 和 SLICED 为主。只对有正确九宫格边界的底板、按钮底图和条形背景使用 SLICED；图标、人物和复杂纹理保持等比缩放。
- ScrollView 必须设置 `content`，Content 必须位于带 Mask 的 viewport 子树中。当前工程常省略序列化 `view`，以 `content.parent` 的 Mask 节点作为实际 viewport；复用这类结构时不要为了消除 warning 再造一层 View。
- 长列表可在 Content 上使用 `ListEnhance`。它通过 `UIOpacity` 隐藏视区外的直接子项，因此 Content 的直接子节点应当是完整 item 根节点，不要把一个 item 拆成多个平级渲染节点。
- 顶部、底部或全屏边缘控件需要安全区时使用 `Widget + SafeWidget`。`SafeWidget` 只适合位置不再被动画或业务代码修改的节点；同一轴不要同时交给 SafeWidget、动画和手动位置维护。

## 优先复用的 Prefab

| 用途 | Prefab URL | 现有使用特点 |
| --- | --- | --- |
| 红点 | `db://assets/bundles/dynamic/prefab/RedDot.prefab` | HUD、邮件等状态提示 |
| 战斗道具 | `db://assets/bundles/dynamic/uiPrefab/fightItems/FightItem.prefab` | 关卡、战斗目标和大师挑战复用 |
| 钻石栏 | `db://assets/bundles/dynamic/uiPrefab/common/topDiamond.prefab` | 商店、复活、HUD 等顶栏 |
| 金币栏 | `db://assets/bundles/dynamic/uiPrefab/common/topGold.prefab` | HUD、商店和升级界面 |
| 材料栏 | `db://assets/bundles/dynamic/uiPrefab/common/topMat.prefab` | 材料相关界面 |
| 广告按钮 | `db://assets/bundles/dynamic/uiPrefab/common/AdBtnItem.prefab` | 签到、任务、转盘入口 |
| 通用奖励项 | `db://assets/bundles/dynamic/uiPrefab/common/rewardItemShell.prefab` | 图标、数量、状态标记和点击说明 |
| 通用光效底 | `db://assets/bundles/static/Effect/AI_di.prefab` | 奖励、结算和章节提示 |

实例化前用 AssetDB 查询实际 UUID 和依赖；不要把表中的历史 UUID 固化到技能或脚本里。

## 拼装前核对清单

1. 从目标 Prefab 根组件定位控制脚本，搜索 `this.rc.get(...)` 和 `onClickButton(...)`。
2. 查看同目录中最接近的一个完整窗口和一个可复用 item，不从全工程最复杂界面复制结构。
3. 列出蓝图中需要复用的公共 Prefab、SpriteFrame、字体和动画资源。
4. 标出 `$` 绑定、Switch 子节点顺序、动态模板、初始禁用状态、ScrollView Content 和 SafeWidget 边界。
5. 拼装完成后刷新所有受影响的 ReferenceCollector，并分别验证静态 Prefab 与实际运行状态。
