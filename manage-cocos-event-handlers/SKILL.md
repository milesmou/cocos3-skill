---
name: manage-cocos-event-handlers
description: 配置 Cocos Creator 3.8 Button、Toggle、ScrollView、EditBox、VideoPlayer 等组件的序列化 EventHandler 数组。适用于添加、替换或清理 Inspector 事件回调，并验证目标节点、组件类和方法名。
---

# 管理 Cocos EventHandler

先确认目标脚本组件已经挂载，且回调方法存在。事件方法名区分大小写。

## 设置事件

复杂引用使用 Scene Script 的 `$eventHandler` 描述符：

```json
{
  "clickEvents": [
    {
      "$eventHandler": {
        "target": "Canvas/Controller",
        "component": "MainMenu",
        "handler": "onClickStart",
        "customEventData": "start"
      }
    }
  ]
}
```

调用：

```powershell
node ../control-cocos-editor/scripts/cocos-editor.mjs --project <工程目录> request scene-script setComponentProperties '["Canvas/StartButton",{"type":"cc.Button"},{"clickEvents":[{"$eventHandler":{"target":"Canvas/Controller","component":"MainMenu","handler":"onClickStart","customEventData":"start"}}]}]'
```

设置后重新检查组件属性，并确认目标节点、目标组件和 handler 均存在。项目运行时的事件监听仍必须在 `onEnable()`/`onDisable()` 中成对注册和注销。
