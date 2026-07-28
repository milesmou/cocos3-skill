---
name: cocos-prefab-preview
description: Preview and inspect Cocos Creator 3.8 `.prefab` UI content, preferring the Creator 3.8.5+ built-in Prefab Inspector preview when the editor bridge is available and falling back to a static HTML renderer for headless use. Supports screenshots, comparisons, nested prefabs, Sprite, Label, Mask, Spine placeholders, and sliced sprites.
---

# Cocos Prefab Preview

## Workflow

1. Locate the Cocos Creator project root. Prefer the directory containing `assets/`, `library/`, `package.json`, and `settings/`.
2. When Creator 3.8.5 or newer and `control-cocos-editor` are available, query the Prefab with AssetDB and call `open-asset` using its UUID. Prefer the built-in Inspector preview for authoritative rendering and import diagnostics.
3. When Creator is unavailable or an HTML artifact is required, run the bundled renderer:

```bash
node cocos-prefab-preview/scripts/cocos-prefab-preview.mjs <projectRoot> <prefabPath> <outHtml> [scale]
```

Example:

```bash
node cocos-prefab-preview/scripts/cocos-prefab-preview.mjs . assets/bundles/dynamic/uiPrefab/upMachine/oneMchineUpNode.prefab cocos-prefab-preview/preview/oneMchineUpNode.preview.html 1
```

Use `scale` below `1`, such as `0.55`, when the full prefab is taller than the browser viewport and a complete non-stitched screenshot is needed.

4. Open the generated HTML through the bundled Node static server when browser verification is needed. Browser policies may block `file:///` pages from loading local images.

```bash
node cocos-prefab-preview/scripts/serve-preview.mjs <previewDir> 4177
```

5. Verify the page visually and, when possible, capture a screenshot. Check that image counts load, sliced backgrounds render, labels are visible, Spine placeholders mark any `sp.Skeleton` nodes, and the static bounds look plausible.
6. Stop the Node static server after verification, then delete copied temporary preview resources:

```bash
node cocos-prefab-preview/scripts/cocos-prefab-preview.mjs --cleanup <outHtml>
```

## What It Handles

- Cocos Creator JSON `.prefab` files.
- `cc.Node`, `cc.UITransform`, `cc.Sprite`, `cc.Label`, and `sp.Skeleton` placeholders that show the skeleton asset filename.
- Nested `cc.PrefabInfo` / `cc.PrefabInstance` references when the referenced prefab can be resolved through `assets/**/*.prefab.meta`.
- SpriteFrame UUID lookup through `assets/**/*.png.meta` and `library/<uuid-prefix>/<uuid>@f9941.json`.
- Static node hierarchy transforms, active state, anchors, sprite opacity, scaled label font size/line height/outline, basic label alignment, rectangular `cc.Mask` clipping, `sp.Skeleton` placeholder boxes, and `Sprite.Type.SLICED` cap insets through CSS `border-image`.
- Copying referenced png files into a temporary `<outHtml>.assets/` folder so the page can be served from localhost.
- Writing `<outHtml>.assets.json` and supporting `--cleanup <outHtml>` to delete only the copied preview resources after previewing.

## Limitations

- Treat the result as a static approximation, not a full Cocos runtime render.
- It does not execute TypeScript components, dynamic data binding, animation clips, runtime resource loading, custom shaders/materials, or rich text.
- Spine support is a static placeholder only; it does not parse skeleton/atlas data, render attachments, or play animation.
- Mask support is rectangular and axis-aligned; it does not emulate image/stencil masks or rotated masks.
- It does not draw Cocos Creator editor overlays such as grid lines, selection rectangles, or transform gizmos.
- `cc.Layout` results are usually already serialized in prefab child positions; if a prefab depends on runtime layout recalculation, compare against a Creator screenshot and adjust the renderer carefully.
