# Bridge command reference

Use `node control-cocos-editor/scripts/cocos-editor.mjs --project <project> request <target> <method> '<args-array>'`.

Export a Prefab through Creator 3.8.5-3.8.x's internal WebGL renderer:

```powershell
node control-cocos-editor/scripts/cocos-editor.mjs --project <project> --timeout 60000 --width 1024 --height 768 preview db://assets/ui/example.prefab temp/previews/example.png
```

The output must be a `.png` inside the target project. This opens a temporary simple panel, calls the internal `scene:prefab-preview` renderer, switches and verifies `is2DView`, captures its WebGL canvas, and closes the panel if the bridge opened it. A successful result includes `"previewMode": "2D"`.

## Targets

- `scene`: forwards an allowlisted public Creator 3.8 Scene message.
- `asset-db`: forwards an allowlisted Creator 3.8 AssetDB message.
- `scene-script`: calls a method in the bundled scene script.

## Scene messages

Common messages:

- `query-is-ready`, `query-dirty`, `query-node-tree`
- `query-node`, `query-component`, `query-components`, `query-classes`
- `open-scene`, `save-scene`, `close-scene`
- `create-node`, `duplicate-node`, `set-parent`, `remove-node`, `reset-node`
- `create-component`, `remove-component`, `reset-component`
- `set-property`, `reset-property`, `restore-prefab`

For `set-property`, first call `query-node` or `query-component`, copy the target property dump, change only its `value`, then send:

```json
[{"uuid":"object-uuid","path":"position","dump":{"value":{"x":1,"y":2,"z":3}},"record":true}]
```

## AssetDB messages

Common messages:

- `query-assets`, `query-asset-info`, `query-asset-meta`
- `query-asset-dependencies`, `query-asset-users`
- `create-asset`, `import-asset`, `copy-asset`, `move-asset`, `delete-asset`
- `refresh-asset`, `reimport-asset`, `refresh`

Use `db://assets/...` URLs for destinations and queries whenever possible.

`query-asset-dependencies`, `query-asset-users`, `query-asset-data`, `is-busy`, and full `refresh` are typed protected Editor messages in Creator 3.8 rather than stable public extension APIs. Keep the bridge version pinned to Creator 3.8.x, and re-check the installed declarations before carrying these calls to another Creator minor line.

## Scene-script methods

- `inspectTree(options?)`
- `inspectNode(selector)`
- `inspectComponent(nodeSelector, componentSelector, options?)`
- `inspectUILayout(selector?, options?)`
- `createNode(options)`
- `updateNode(selector, values)`
- `listComponents(nodeSelector)`
- `addComponent(nodeSelector, registeredClassName)`
- `setComponentProperties(nodeSelector, componentSelector, values)`
- `validateScene()`
- `validateUI(selector?, options?)`
- `prefabAction(action, nodeSelector, options?)`, where action is `apply`, `restore`, `unlink`, `create`, or `link`
- `animationQuery(action, ...args)`
- `animationOperation(operations, options?)`
- `saveAnimation()`

Prefer public Scene messages for mutations because they integrate with Creator's undo system. Use scene-script mutation helpers only when the public dump/message interface cannot express the operation.
