---
name: create-special-cook-machine
description: >
  为章节特殊烹饪设备编写 cookMachine 子类脚本：放 Level_X/scripts、覆写补货/制作/交互钩子、
  对接 machineShow Spine、挂预制体。触发词包括：特殊设备、专用设备脚本、特殊烹饪机、
  cookMachine 子类、Level_X/scripts 设备、渔船/烤炉类特殊机台、继承 cookMachine、
  create-special-cook-machine、特殊设施脚本。不要用本技能做通用 Component；
  通用组件用 create-cocos-component-script。
---

# 创建特殊烹饪设备脚本

遵循项目根 `AGENTS.md`。本技能只覆盖**战斗烹饪设施**的章节专用逻辑，不替代编辑器拼装技能。

## 何时使用

用户要求（或需求等价于）为某个 `machine_*` / 关卡机台写**专用脚本**时，必须先读本文件再动手。典型信号：

- 「特殊设备 / 专用设备 / 特殊机台脚本」
- 继承 `cookMachine`，放 `assets/bundles/Level_X/scripts/`
- 改补货表现、火力、骨骼库存、自动补货、特殊交互拦截等

若只是新建普通 UI/逻辑组件，改用 `create-cocos-component-script`。

## 禁止事项

1. 不要把特殊逻辑堆进通用 `cookMachine` / `machineCtrl`，除非用户明确要求抽公共钩子，且改动尽量小。
2. 不要新建第二套设备基类；默认 `extends cookMachine`。
3. 不要手写 `.meta`；脚本创建与挂载走 `create-cocos-component-script` + `manage-cocos-components`（或等价 AssetDB/Scene 流程）。
4. 禁止循环引用；仅类型依赖用 `import type`。
5. 脚本必须 LF 换行；注释与交流用中文。

## 参考实现（先读再写）

按需对照，不要无脑复制：

| 场景 | 路径 |
| --- | --- |
| 火力改制作时间 | `assets/bundles/Level_2/scripts/JiaoHuaJiKaoLu.ts` |
| 骨骼库存 + 自动补货动画 | `assets/bundles/Level_4/scripts/yuXiaChuanMachine.ts` |
| 基类钩子 | `assets/scripts/ui/battle/machine/cookMachine.ts` |
| 表现层 | `assets/scripts/ui/battle/machine/machineShow.ts` |

## 落地位置与命名

1. 目录：`db://assets/bundles/Level_<章节表 LevelTabId>/scripts/`
2. 文件名与 `@ccclass('...')` 保持一致（项目现有风格：驼峰类名）。
3. 一个机台一个专用类；多个机台共享同一套规则时可共用一个类（如渔船虾/鱼）。

## 推荐工作流

1. **确认配置与预制体**
   - 机台 id、所属 Level bundle、Prefab 路径。
   - Prefab 上是否已有通用 `cookMachine`；专用类是**替换**还是**额外挂载**（通常替换为子类组件）。
   - 特殊表现依赖的节点 / `$` 引用 / Spine 动画名与骨骼名（向用户确认或查资源，禁止编造）。

2. **确认可覆写钩子（以 cookMachine 现状为准）**
   - `maxStockNum`、`getAddFoodTimeS()`、`startAddFoodNum()`
   - `showNumBar()`、`initMachineData` / `initOnBattleStart` / `initMachineState`
   - `getWorkTime()`、`roleActiveMeCheck()`
   - 需要基类新钩子时：先说明理由，再最小改动基类，避免为大需求重构。

3. **写子类**
   - `import { cookMachine } from 'db://assets/scripts/ui/battle/machine/cookMachine'`
   - Prefab 节点用 `ReferenceCollector`：`this.rc.get('Key', Type)`，初始化缓存，禁止 `update` 里反复 `get` / `find`
   - 状态用 TS 字段；仅变化时同步 Spine / UI
   - 定时器用 `schedule` / `unschedule`；`onDisable` / `initMachineState` 成对清理
   - 日志用 `mLogger`，禁用 `console`

4. **Spine / machineShow 注意**
   - 优先走 `myMachineShowTs` / 基类 `playAnimState`；需要绕过「同状态不重播」时，先查 `machineShow` 是否已有强制接口，没有再最小扩展。
   - 补货 / 制作动画时长必须与逻辑时长对齐；引导中补货时常被压成 1 秒（见 `getAddFoodTimeS`）。
   - 隐藏库存条 / 补货条后，必须处理 `roleActiveMeCheck`：父类可能把「条未激活」当成异常自愈。

5. **创建与挂载**
   - 复用 `../create-cocos-component-script/SKILL.md` 的创建、导入和注册步骤，写入已完成的 cookMachine 子类；不重新进入该技能的业务分流或普通 Component 模板。
   - 用编辑器技能打开目标 Prefab，卸掉或替换旧 `cookMachine`，挂上新类；保存并 `wait idle`。
   - 不要手改 Prefab 序列化文本。

6. **自检**
   - 开局 / 战斗开始 / 重置后特殊 UI 与骨骼状态正确。
   - 补货、制作、拿取、引导压缩时间、技能加速路径不互相打断到脏状态。
   - 无 `update` 高频查节点；无循环引用；LF。

## 交付说明（给用户）

简要说明：挂载节点、是否替换原 `cookMachine`、依赖的 `$` 节点 / 动画名、是否改了基类钩子、如何验证。
