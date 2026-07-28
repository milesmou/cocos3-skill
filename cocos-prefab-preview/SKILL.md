---
name: cocos-prefab-preview
description: 使用 Cocos Creator 3.8.5-3.8.x 编辑器内部 Prefab WebGL 渲染器，以强制 2D 模式导出真实 PNG。适用于查看、截图、比较和验收 .prefab UI，覆盖嵌套 Prefab、材质、Mask、Spine、Layout 和引擎实际导入结果；要求 Creator 编辑器及桥接扩展可用。
---

# 预览 Cocos Prefab

只使用 Creator 内部真实渲染。编辑器不可用、版本低于 3.8.5 或内部接口失败时停止并报告，不生成近似预览。

## 真实 PNG

1. 安装并刷新 `control-cocos-editor` 桥接扩展 1.2.0 或更高版本。
2. 等待编辑器和 AssetDB 就绪。
3. 使用 `db://assets/...` URL 或 Prefab UUID 导出：

   ```powershell
   node ../control-cocos-editor/scripts/cocos-editor.mjs `
     --project <工程目录> `
     --timeout 60000 `
     --width 1024 `
     --height 768 `
     preview db://assets/ui/example.prefab temp/cocos-previews/example.png
   ```

4. 检查返回的 UUID、尺寸、字节数和绝对输出路径，再查看 PNG。

输出必须位于目标工程内并使用 `.png`。桥接会临时打开一个 Creator `simple` 面板，复用 Inspector 的 `PreviewExtends`、`scene:prefab-preview` 和 `query-prefab-preview-data`，强制切换并确认 2D 视图，完成 WebGL 绘制后立即读取 Canvas。它不会修改 Prefab。

## 验收

- 确认导出来源是 `scene:prefab-preview`。
- 确认返回的 `previewMode` 是 `2D`；切换失败时停止导出，不接受上一次遗留的 3D 状态。
- 对比不同宽高时保持 Prefab 不变；宽高只是预览 Canvas 尺寸。
- 若 PNG 透明区域在图片查看器中显示为黑色，换用支持透明通道的查看器，不要据此修改 Prefab。
- Creator 升级到 3.9 或其他版本前重新核对内部接口；不要绕过桥接的版本检查。
