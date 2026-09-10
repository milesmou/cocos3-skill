# Cocos Creator 3.8 UI assembly rules

## Structure

- Put every 2D renderable node below a `Canvas` or `RenderRoot2D`.
- Give every layout, renderer, mask, or interactive UI node a `UITransform`.
- Use hierarchy sibling order for draw order. `UITransform.priority` is deprecated.
- Prefer nested Prefabs for repeated controls and panels. Do not nest a Prefab inside itself.
- Group related headings, backgrounds, content, and controls under semantic functional-region nodes; do not leave all leaf nodes flat under the page or panel root.
- Put every visible button text Label inside its corresponding Button node, normally as a direct child; never keep a Button and its text Label as siblings.
- Keep visual overlays such as labels, icons, and badges in the same coordinate system as the plate, frame, or background they are attached to. Make them descendants of the carrier node or siblings under one zero-offset container, and store their placement as carrier-relative coordinates.

## Geometry and adaptation

- Set `UITransform.contentSize` and `anchorPoint` before configuring `Widget`.
- Choose each node's anchor from its intended attachment point before converting screenshot coordinates to local coordinates; changing the anchor afterward requires recomputing position.
- For every Label, set horizontal alignment, vertical alignment, overflow, and UITransform size before positioning it. Do not offset a node to compensate for an incorrect text-alignment mode.
- Treat Widget-controlled position or size axes as derived values. Do not also animate or manually maintain those axes.
- Use project settings for design resolution and fit mode; do not encode a second design resolution in the Prefab.
- Configure child sizes before enabling `Layout`. Choose `NONE`, `CHILDREN`, or `CONTAINER` resize mode intentionally.
- After bulk edits, call `Layout.updateLayout()` and `Widget.updateAlignment()` through `scene.execute-component-method` before measuring bounds.

## Masks and scrolling

- A non-sprite `Mask` requires its generated `Graphics` component.
- A `SPRITE_STENCIL` Mask requires `Sprite` and a SpriteFrame.
- Do not put Label, RichText, Sprite, or another renderer on a Mask node, except the Sprite required by `SPRITE_STENCIL`.
- Always assign `ScrollView.content`. Prefer an explicit `ScrollView.view`, make content its descendant, and put the Mask on the view node.
- Some established projects omit the serialized `view` and use the Mask-bearing `content.parent` as the effective viewport. Preserve that structure when it is already the project convention; require content to remain below that Mask and do not add a redundant viewport only to silence a warning.

## Interaction

- Set Button/Toggle transition target and state assets after the visual hierarchy exists.
- Bind serialized EventHandlers last. Verify target node, registered component class, method name, and custom event data.
- Before adding a serialized EventHandler, check whether the project's UI base class already routes clicks by button name or runtime listeners. Use one dispatch path for the same action.
- Add `BlockInputEvents` to modal blockers when clicks must not pass through; its node needs a correctly sized `UITransform`.

## Text decoration

- Use `Label.isUnderline` for underlined text. Do not draw a text underline with a Sprite, Graphics, or a separate line node.
- When only part of a sentence is underlined, split it into separately aligned Label nodes so only the linked phrases enable `isUnderline`.
- Configure text outlines only through `Label.enableOutline`, `Label.outlineColor`, and `Label.outlineWidth`. Do not add a separate `LabelOutline` component.

## Placeholder visuals

- Use a solid-color Sprite only when the corresponding art resource was not provided or cannot be uniquely identified in the project.
- Use a neutral white SpriteFrame tinted with `Sprite.color`; do not use patterned defaults, similar artwork, or cropped pieces of the reference image as substitutes.
- Keep each placeholder on the node that will receive the final asset, preserve its measured size and anchor, and report every placeholder at handoff.
- Never replace supplied or explicitly selected art with a placeholder.

## Official references

- Prefab: https://docs.cocos.com/creator/3.8/manual/en/asset/prefab.html
- Canvas: https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/canvas.html
- UITransform: https://docs.cocos.com/creator/3.8/api/en/class/UITransform
- Widget: https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/widget.html
- Layout: https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/layout.html
- Mask: https://docs.cocos.com/creator/3.8/manual/en/ui-system/components/editor/mask.html
