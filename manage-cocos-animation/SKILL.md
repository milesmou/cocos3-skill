---
name: manage-cocos-animation
description: 查询和编辑 Cocos Creator 3.8 Animation 根节点、AnimationClip dump、可动画属性、关键帧操作和动画事件，并通过编辑器动画管理器保存修改。适用于程序化分析或批量调整 Creator 动画资源。
---

# 管理 Cocos 动画

动画操作依赖 Creator 3.8 的编辑器动画管理器。修改前必须保存 clip dump 作为回滚基线。

## 查询

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script animationQuery '["queryAnimationRootInfo","<节点UUID>"]'
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script animationQuery '["queryAnimationClipDump","<动画根UUID>","<Clip UUID>"]'
```

## 修改

1. 从 Creator 返回的 clip dump 和编辑信息中确定属性路径、时间和数据类型。
2. 将目标 clip 设为当前编辑 clip：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script animationQuery '["setEditClip","<Clip UUID>"]'
   ```

3. 生成 Creator 3.8 动画管理器接受的 operation 数组；不要猜测函数名或参数。
4. 一次提交同一意图的操作：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script animationOperation '[[{"funcName":"<从当前编辑器操作模型确认的方法>","args":[]}],{}]'
   ```

5. 查询 clip dump 对比结果。
6. 调用 `scene-script saveAnimation`，然后保存场景或 Prefab。

当无法从当前 Creator 返回数据确认 operation schema 时停止，不直接改写 `.anim` 或动画曲线序列化 JSON。
