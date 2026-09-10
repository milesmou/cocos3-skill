# MyCookingGirl UI Prefab 结构基线

本参考适用于 `D:/Workspace/XiaoGuan/program/trunk/MyCookingGirl`。数据来自 `assets/bundles/dynamic/uiPrefab` 当前 77 个 Prefab 的序列化结构和 `cocos3-toolkit` UI 基类。数量用于判断惯例强度，不要求后续 Prefab 维持固定统计值。

## 工程与样本概况

- Creator 版本：3.8.8。
- 设计分辨率：750 × 1334，`fitWidth: true`、`fitHeight: false`。
- 样本：77 个 Prefab、3393 个序列化 Node。
- 层级深度：中位数 5，最大 11。结构允许为控制器、裁剪、状态和复用增加必要层级，不追求统一的浅树。
- 52 个 Prefab 根节点尺寸为 750 × 1334；其余是列表项、战斗节点、货币栏或小型控件，保留自身尺寸。
- 52 个全屏根中，48 个包含一级 `home` 内容容器；39 个根有 Animation，13 个有 UIOpacity，6 个有 Widget。`home` 是强惯例，Animation、UIOpacity 和 Widget 按职责选择。

## 根节点和一级结构

- Prefab 根节点名通常与文件名一致。
- 全屏窗口常见结构是根控制器下放置 `home`。弹窗还会在 `home` 前放置 `fullCoseBtn`、`BtnCloseFull`、`BtnClose` 或同类外部点击区。
- 一级关闭热区是否存在、名称和渲染顺序必须参考同目录 Prefab 与控制脚本，不统一改名。
- `UIAvg`、`UIGuide`、`UIGameFailReason`、`UIDress` 和 Loading 等职责特殊的窗口没有标准 `home` 结构，证明 `home` 不是硬性模板。
- 全屏根默认使用 750 × 1334。小控件不得被扩成全屏根。

推荐按职责选择参考：

| 目标职责 | 优先查看的 Prefab |
| --- | --- |
| 常规全屏或弹窗 | 同业务目录内以 `UI` 开头且根为 750 × 1334 的 Prefab |
| 长列表或滚动页 | `UILetter`、`UIStroy`、`UIUpMachineList`、`UIMasterChallengeRank` |
| HUD | `UIHUD`，只复用其锚定和公共实例策略，不复制整棵复杂树 |
| 通用奖励项 | `common/rewardItemShell.prefab` |
| 战斗道具 | `fightItems/FightItem.prefab` 和对应 `FightItem_200x` 变体 |
| 顶部货币栏 | `common/topDiamond.prefab`、`topGold.prefab`、`topMat.prefab` |

## 控制器和 ReferenceCollector

- 77 个根节点中有 70 个挂 ReferenceCollector；全屏根中有 51 个。没有根收集器的 7 个样本主要是简单战斗状态节点、流程子 Prefab 或 FightItem 变体。
- 全部 Prefab 中共有 317 个 ReferenceCollector，其中 247 个位于嵌套节点。这些节点通常也是列表项或子控制器边界。
- 共有 852 个以 `$` 开头的节点。ReferenceCollector 收集当前控制子树中的 `$` 节点，key 是去掉 `$` 并 trim 后的名称。
- 遇到下一级 ReferenceCollector 时，外层收集器跳过该子树。蓝图必须按作用域列出 `$` 节点，不能把整个 Prefab 的 `$` 节点都归给根控制器。
- 同一作用域内 key 必须唯一。已有 `$ItemNum`、`$iconPic`、`$rewardList` 等大小写属于代码接口，不做统一大小写或拼写修正。
- 新建全屏业务 UI 时，只有控制脚本继承 MUIComponent 或相邻结构明确要求，才在同节点规划 ReferenceCollector；简单纯视觉节点不机械添加。

## MButton 的事件归属

- 样本中有 365 个 MButton。普通 UI 点击优先使用 MButton，而不是新增原生 cc.Button。
- MUIComponent 会扫描自己控制范围内的 MButton，并把点击转发到 `onClickButton(button.node.name, button)`。
- 扫描遇到嵌套 MUIComponent 时停止。因此按钮归属最近的控制器边界，父控制器不得重复声明子控制器中的按钮。
- `closeBtn`、`BtnClose`、`fullCoseBtn`、`BtnCloseFull`、`btnBack` 等名称常被控制脚本用字符串分发。蓝图必须搜索脚本后保留稳定名称。
- 默认采用自动分发时不再添加指向同一逻辑的序列化 clickEvents。
- 相邻界面没有特别配置时，普通 MButton 的常见基线是 SCALE transition、`zoomScale = 0.9`、`duration = 0.1`、默认点击音效和 `cooldown = 0.2`；最终值仍以参考 Prefab 为准。

## Switch 是显示状态组件

- 样本中有 108 个项目 Switch。它遍历直接子节点，并根据 `checkIndex` 显隐指定索引；脚本也可能使用 `updateCheckByName`。
- Switch 的直接子节点顺序和名称是状态契约。蓝图必须列出完整顺序、默认 `checkIndex` 和按名称访问情况。
- Switch 不等同于 Toggle。只有用户可选择且需要 ToggleContainer 语义时才规划 Toggle。
- `$stageSw`、`$swNode`、`$btnSw` 等常见命名体现脚本引用，不要求新状态节点沿用相同名字；应按目标脚本和相邻 Prefab 决定。

## 重复项、模板与初始状态

- 有 272 个节点初始为 inactive，可能表示状态备选、运行时模板、特效、引导或暂不显示的内容。
- 不要把所有 inactive 节点当成模板，也不要在拼装时全树激活。蓝图要记录默认状态和激活者。
- 项目既有固定槽位和 Switch 状态子节点，也有运行时克隆模板和脚本生成列表。发现多个相似 item 时，先搜索脚本是否按固定索引、子节点名称或固定数量访问。
- 动态列表优先使用一个完整 item 根作为模板，或实例化已有 item Prefab。Content 的直接子项应保持完整，便于 Layout、裁剪和列表优化组件处理。

## Layout、ScrollView 和裁剪

- 样本中有 149 个 Layout：87 个水平、52 个垂直、10 个网格；多数使用 `resizeMode = CONTAINER`。
- 先确定 item 尺寸和间距，再从内向外更新 Layout。不要让同一轴同时受 Layout、Widget 和手动位置控制。
- 18 个 ScrollView 都没有显式序列化 `view`，而是把 Content 放在名为 `view` 或 `View`、带 Mask 的父节点下。
- 蓝图仍要写出 ScrollView、viewport、Mask 和 Content 的完整路径，但引用方式标为 `viewportSource = content.parent`。不要为补一个通用 `View` 字段再造层级。
- Mask 必须是 Content 的祖先。Content 的 Layout 方向、锚点、初始位置、间距和生成策略必须明确。

## 动画和排序结构

- 样本中有 95 个 Animation 和 100 个 Sorting2D。39 个全屏根直接挂 Animation，说明窗口打开关闭动画经常以根为播放边界，但不是所有窗口都需要。
- 重构现有节点前查询 AnimationClip 的轨道目标。被轨道引用的节点路径不能只为统一命名而改变。
- 项目排序组件会把某个子树作为整体处理，并可能在嵌套排序组件处停止遍历。蓝图要记录排序边界，不把内部 Sprite 随意提到边界外。
- 动画或脚本控制的位置、缩放、透明度和激活状态要在规格表中标为动态，避免再由 Widget、Layout 或静态状态同时控制。

## 嵌套 Prefab 复用

77 个 Prefab 中共有 50 个 PrefabInstance。最常见依赖如下：

| Prefab | 实例次数 | 规划用途 |
| --- | ---: | --- |
| `db://assets/bundles/dynamic/prefab/RedDot.prefab` | 10 | 红点状态 |
| `db://assets/bundles/dynamic/uiPrefab/fightItems/FightItem.prefab` | 10 | 战斗道具和目标 |
| `db://assets/bundles/static/Effect/AI_di.prefab` | 9 | 通用光效底 |
| `db://assets/bundles/dynamic/uiPrefab/common/topDiamond.prefab` | 8 | 钻石栏 |
| `db://assets/bundles/dynamic/uiPrefab/common/topGold.prefab` | 4 | 金币栏 |
| `db://assets/bundles/dynamic/uiPrefab/common/AdBtnItem.prefab` | 3 | 广告入口 |

其他已复用资源包括 `mainGmBtnList`、`moveNum`、`lianJiAnimNode` 和 `topMat`。规划时通过 AssetDB 查询当前 URL 和 UUID，不把 UUID 固化在蓝图中。

- 蓝图用一个 instance 节点代表公共 Prefab，不展开复制内部树。
- 记录位置、缩放、激活状态和必要属性覆盖。
- 如果控制脚本需要访问实例内部，优先通过实例根组件或已有公开引用完成；不要依赖易变的深层路径。

## 美术资源与结构占位

- 已提供效果图资源或能在工程中唯一定位到正式 SpriteFrame 时，蓝图记录真实资源 URL。
- 只有对应资源缺失时，才规划纯色 Sprite 占位并标记为近似效果。
- 不用相似图片、默认花纹或裁剪效果图替代正式资源。
- 同一界面可以逐元素采用正式资源和纯色占位；所有占位项集中列入待补资源表。

## 交付前核对

1. 目标属于全屏窗口还是可复用小 Prefab，根尺寸是否正确。
2. 根控制器和每个嵌套控制器的 ReferenceCollector 作用域是否清楚。
3. `$` key、按钮名、Switch 子节点顺序是否与脚本一致。
4. 固定槽位、状态节点、模板和 runtime 内容是否正确分类。
5. 公共 Prefab 是否保持实例关系，属性覆盖是否最小。
6. ScrollView 的 viewport 推断关系、Mask 祖先和 Content 布局是否完整。
7. 默认 inactive 节点、动画轨道目标、排序边界和最高渲染层是否明确。
8. 正式资源与纯色占位是否逐项区分。
