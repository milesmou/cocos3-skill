---
name: capture-cocos-runtime
description: 捕捉当前正在运行的 Cocos Creator 3.8 普通 Web 预览 GameCanvas，并将实际运行画面保存为工程内 PNG。适用于运行时画面截图、视觉检查和对比；不用于 Prefab 静态预览、原生 Simulator、Android、iOS 或小游戏平台。
---

# 捕捉 Cocos 运行时画面

复用 `control-cocos-editor` 安装的本机桥接和项目 `preview-template`，只捕捉开发人员当前正在操作的普通 Web 预览，不启动第二个浏览器。

命令中的 `<技能根目录>` 替换为本技能集合所在目录的绝对路径（包含 `control-cocos-editor` 等子目录），`<工程目录>` 替换为目标 Cocos 工程绝对路径；保留路径引号，不依赖当前工作目录。

## 工作流

1. 读取并遵循 `../control-cocos-editor/SKILL.md` 和 `../control-cocos-editor/references/runtime-node-stats.md`。
2. 执行 `status`，要求 `runtimeInspector.screenshotPng` 为 `true` 且 `runtimeInspector.connectedInstances` 恰好为 `1`。能力字段缺失时调用 Creator 顶部菜单 `开发者 -> 重新加载` 并等待桥接重新就绪；没有连接时刷新现有 Web 预览；多个连接时关闭多余预览，禁止猜测目标实例。
3. 将截图保存到工程 `temp/capture-cocos-runtime/` 下的 `.png` 路径：

   ```powershell
   node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" `
     --project "<工程目录>" `
     --timeout 15000 `
     runtime-screenshot temp/capture-cocos-runtime/current.png
   ```

4. 检查返回的 `renderer`、绝对输出路径、宽高和字节数，并查看 PNG 做视觉验收。

## 边界

- 截图源固定为 `GameCanvas`，分辨率使用 Canvas 实际像素尺寸。
- 截图不包含节点树、选中框和其他 DOM 调试层。
- 截图请求等待下一帧绘制完成；游戏暂停时会回退到当前 Canvas 内容。
- 跨域资源污染 Canvas、空画布、编码失败或超时必须直接报告，不生成近似图片。
- 输出必须位于目标工程的 `temp/capture-cocos-runtime/`（或其子目录）并使用 `.png` 扩展名；桥接会拒绝 `temp/` 以外的路径。
- 只支持 Browser Preview 和 Preview in Editor 的 Web 预览；不支持 Simulator、Android、iOS 或小游戏平台。
