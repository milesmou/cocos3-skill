---
name: control-cocos-editor
description: 安装并使用本地认证桥接扩展，通过 Cocos Creator 3.8 官方 Scene、AssetDB 消息和 Scene Script API 控制编辑器，并按需读取普通 Web 预览的运行时节点统计或捕捉 GameCanvas。适用于连接编辑器、查询或修改编辑内容、保存、等待资源导入和检查运行时状态。
---

# 控制 Cocos Creator 编辑器

通过 Creator 官方消息修改打开的场景、Prefab 和资源，不直接改写 Prefab 序列化文件。

命令中的 `<技能根目录>` 替换为本技能集合所在目录的绝对路径（包含 `control-cocos-editor` 等子目录），`<工程目录>` 替换为目标 Cocos 工程绝对路径；保留路径引号，不依赖当前工作目录。

## 首次安装

1. 先确认目标工程是否已有 Creator 实例。每个工程最多只能运行一个实例；如果工程已经打开，必须复用现有实例，不得再次启动。
2. 工程未打开时，使用 `cocoscreator` 命令启动目标工程：

   ```powershell
   cocoscreator --project "<工程目录>"
   ```

   需要重启时，先完全关闭该工程的现有 Creator 实例，再执行启动命令。
3. 安装桥接扩展：

   ```powershell
   node "<技能根目录>/control-cocos-editor/scripts/install-bridge.mjs" --project "<工程目录>"
   ```

4. 在 Creator 的扩展管理器中启用 `cocos3-codex-bridge`，然后调用 Creator 顶部菜单的 `开发者 -> 重新加载`。导入 Creator 编辑器插件，或修改已安装插件的代码和配置后，都必须再次调用该重新加载功能；不要用重启 Creator 代替，也不要只刷新扩展管理器。修改 AssetDB 管理的工程资源（`db://assets/...`）不执行此步骤，也不重启工程，只等待资源导入完成。
5. 等待 Creator 界面重新加载完成，再检查连接：

   ```powershell
   node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" status
   ```

   返回结果中的 `editorDirectory` 是当前 Cocos Creator 编辑器的安装目录。

6. 自动化流程不要使用固定延时，等待 Scene 与 AssetDB 就绪：

   ```powershell
   node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" --timeout 60000 wait ready
   node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" --timeout 60000 wait idle
   ```

连接文件只写入目标工程的 `temp/cocos3-codex-bridge.json`，服务只监听 `127.0.0.1`，每次扩展启动都会生成新令牌。

所有一次性截图、预览、报告、调试转储和中间文件必须写入目标工程的 `temp/<skill-name>/`。桥接提供的 PNG 导出接口会拒绝 `temp` 目录以外的输出路径。

任务完成并通过验收后，必须删除本次任务创建且不再需要的中间文件和临时中转目录。用户要求的截图、预览图、报告等交付物必须保留并提供路径，不因位于 temp/ 而删除；PNG 仍先由桥接导出到 temp/<skill-name>/，用户指定其他交付位置时再复制到该位置。删除前解析并核对目标绝对路径确实位于目标工程的 `temp/` 下；只删除本次任务创建的内容，禁止删除共享的 `temp` 根目录、Creator 正在使用的文件或其他任务的目录。任务失败且临时产物仍需用于排查时可以暂时保留，但必须向用户说明保留位置和原因，并在问题解决后立即清理。

## 调用

使用统一命令调用 Scene、AssetDB 或 Scene Script：

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene query-node-tree '[]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request asset-db query-assets '[{"pattern":"db://assets/**"}]'
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" request scene-script inspectTree '[{"maxDepth":6}]'
```

完整方法和参数见 [references/api.md](references/api.md)。

## 运行时节点统计

需要查看开发人员当前正常运行的 Web 预览节点数量、激活状态或组件数量时，先读取并遵循 [references/runtime-node-stats.md](references/runtime-node-stats.md)。该功能只在收到命令时遍历一次节点树，不持续采样。

## 运行时画面截图

需要捕捉开发人员当前正常运行的 Web 预览画面时，使用 `capture-cocos-runtime` Skill。该功能只捕捉 `GameCanvas`，不包含节点树等 DOM 调试层。

## 导出 Prefab PNG

Creator 3.8.5-3.8.x 可调用 Inspector 使用的内部 WebGL 预览器：

```powershell
node "<技能根目录>/control-cocos-editor/scripts/cocos-editor.mjs" --project "<工程目录>" --timeout 60000 --width 1024 --height 768 preview db://assets/ui/example.prefab temp/cocos-prefab-preview/example.png
```

该接口属于 Creator 内部实现。桥接会检查版本、强制确认 2D 预览模式并限制输出位于目标工程的 `temp/` 内；编辑器不可用或内部接口失败时停止并报告。

## 安全规则

- 启动或重新启动工程时使用 `cocoscreator --project "<工程目录>"`。
- 同一个工程最多运行一个 Creator 实例；启动前检查现有实例，已打开时直接复用。重启时必须先完全关闭旧实例。
- 导入 Creator 编辑器插件，或修改插件代码和配置后，调用顶部菜单 `开发者 -> 重新加载`，再等待桥接重新就绪；这属于编辑器内重新加载，不是关闭并重启 Creator。
- 修改 AssetDB 管理的工程资源（`db://assets/...`）后只等待 AssetDB idle；不要因此重新加载编辑器或重启工程。
- 修改前先查询目标 UUID、当前属性和 Prefab 状态。
- 优先使用 `scene` 消息执行修改，以进入 Creator 撤销记录。
- 仅在公开消息无法表达操作时使用 Scene Script 修改方法。
- 资源路径优先使用 `db://assets/...`。
- 修改后保存场景或 Prefab，再运行内容验证。
- 资源导入、脚本编译和场景切换后使用 `wait` 轮询实际状态，不猜测等待秒数。
- 不把连接文件、令牌或 `temp` 内容提交到仓库。
- 不开放非本机监听地址，不向桥接白名单加入任意消息转发。
- `references/api.md` 标出的 protected AssetDB 消息只用于 Creator 3.8.x；升级编辑器前重新核对本机类型声明。
