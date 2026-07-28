# Cocos Creator 3.8 UI assembly rules

## Structure

- Put every 2D renderable node below a `Canvas` or `RenderRoot2D`.
- Give every layout, renderer, mask, or interactive UI node a `UITransform`.
- Use hierarchy sibling order for draw order. `UITransform.priority` is deprecated.
- Prefer nested Prefabs for repeated controls and panels. Do not nest a Prefab inside itself.

## Geometry and adaptation

- Set `UITransform.contentSize` and `anchorPoint` before configuring `Widget`.
- Treat Widget-controlled position or size axes as derived values. Do not also animate or manually maintain those axes.
- Use project settings for design resolution and fit mode; do not encode a second design resolution in the Prefab.
- Configure child sizes before enabling `Layout`. Choose `NONE`, `CHILDREN`, or `CONTAINER` resize mode intentionally.
- After bulk edits, call `Layout.updateLayout()` and `Widget.updateAlignment()` through `scene.execute-component-method` before measuring bounds.

## Masks and scrolling

- A non-sprite `Mask` requires its generated `Graphics` component.
- A `SPRITE_STENCIL` Mask requires `Sprite` and a SpriteFrame.
- Do not put Label, RichText, Sprite, or another renderer on a Mask node, except the Sprite required by `SPRITE_STENCIL`.
- Assign `ScrollView.view` and `ScrollView.content`; make content a descendant of view. Put the Mask on the view node.

## Interaction

- Set Button/Toggle transition target and state assets after the visual hierarchy exists.
- Bind serialized EventHandlers last. Verify target node, registered component class, method name, and custom event data.
- Add `BlockInputEvents` to modal blockers when clicks must not pass through; its node needs a correctly sized `UITransform`.

## Official references

- Prefab: https://docs.cocos.com/creator/3.8/manual/en/asset/prefab.html
- Canvas: https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/canvas.html
- UITransform: https://docs.cocos.com/creator/3.8/api/en/class/UITransform
- Widget: https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/widget.html
- Layout: https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/layout.html
- Mask: https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/mask.html
