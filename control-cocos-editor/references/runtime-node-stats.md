# Runtime node statistics

Use this workflow to inspect the node-count state of the same normal Cocos Creator Web preview instance that a developer is currently operating. It does not launch another browser and does not continuously traverse the scene.

## One-time setup

1. Keep the target Creator 3.8 project open and enable `cocos3-codex-bridge`.
2. Install the preview hook:

   ```powershell
   node control-cocos-editor/scripts/install-runtime-inspector.mjs --project <project>
   ```

   The installer preserves an existing `preview-template/index.ejs`, adds one marked script tag, and copies `runtime-node-inspector.js`. If the project has no preview template, it copies the matching Creator 3.8 built-in template first. Never hand-edit the editor's built-in template or engine source.
3. Refresh or restart the developer's normal Browser/Editor Web preview. Do not launch a dedicated debugging browser.
4. Run `status` and require `runtimeInspector.connectedInstances` to be at least 1.

The preview hook keeps only a local EventSource connection to the project bridge. It traverses the runtime scene only after an authenticated Skill command requests a snapshot. The relay listens on `127.0.0.1` at the configured preview server port plus one and accepts only local preview origins.

## Query

Capture all connected preview instances:

```powershell
node control-cocos-editor/scripts/cocos-editor.mjs --project <project> runtime-stats
```

Restrict the count to a unique hierarchy path and control the component summary size:

```powershell
node control-cocos-editor/scripts/cocos-editor.mjs --project <project> runtime-stats '{"root":"Scene/Canvas","topComponents":20}'
```

Report each returned snapshot separately when more than one preview page is connected. Relevant fields are:

- `nodeCount`, `activeNodeCount`, `inactiveNodeCount`
- `componentCount`, `enabledComponentCount`, `disabledComponentCount`
- `maxDepth`, `nodesByDepth`, `nodesByLayer`
- `topComponentTypes`
- `page.url`, `page.visibility`, `scene`, and `root`, which identify the runtime instance and counted subtree

If `timedOut` is true, report the returned snapshots and list `missingInstances`; do not silently treat a partial response as complete.

## Boundaries and troubleshooting

- This inspects Browser preview and Web-based Preview in Editor when they load the project `preview-template`. Native Simulator/device builds are outside this workflow.
- If no instance is connected, refresh the already-open preview after installing the hook. Do not start a second preview merely to obtain a result.
- If the relay port is occupied, change the project's preview server port or stop the conflicting local process, then refresh Creator and the preview.
- The hook is confined to `preview-template`, so it is not included in release build templates.
- Queries are read-only. Do not add runtime mutation or arbitrary code evaluation endpoints to this relay.
