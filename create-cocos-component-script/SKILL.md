---
name: create-cocos-component-script
description: 通过 Cocos Creator 3.8 AssetDB 创建 TypeScript 组件脚本、等待导入编译、确认 ccclass 注册名并挂载到节点。适用于新增项目组件脚本和声明可在 Inspector 中绑定的属性。
---

# 创建 Cocos 组件脚本

遵循项目根 `AGENTS.md` 的 TypeScript、性能、资源和日志规范。不要生成 JSB、Native 或 C++ 绑定。

## 工作流

1. 生成完整 TypeScript 内容，至少包含：

   ```typescript
   import { _decorator, Component } from 'cc';

   const { ccclass } = _decorator;

   @ccclass('ExampleView')
   export class ExampleView extends Component {
   }
   ```

2. 使用 AssetDB `create-asset` 写入 `db://assets/.../ExampleView.ts`。不要自行创建 `.meta`。
3. 轮询 `asset-db is-busy`，直到返回 `false`。
4. 查询资源信息和编辑器控制台编译结果。
5. 调用 `scene query-components` 或 `query-classes`，确认 `ExampleView` 已注册。
6. 使用 `scene create-component` 挂载注册类名。
7. 查询新组件并设置 Inspector 属性。

使用 `@property(Node)`、`@property(Sprite)` 等显式类型；避免 `any`、高频组件查找、无变化 UI 刷新和在 `update()` 中创建对象或加载资源。
