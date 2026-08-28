(function installCocosCodexRuntimeInspector() {
    'use strict';

    /** 当前普通 Web 预览的服务端口。 */
    const previewPort = Number(location.port || 7456);
    /** Creator 扩展提供的本机只读状态中继地址。 */
    const relayOrigin = `http://127.0.0.1:${previewPort + 1}`;
    /** 当前预览页签实例 ID 的会话存储键。 */
    const storageKey = 'cocos3-codex-runtime-instance';
    /** 当前预览页签的稳定实例 ID，用于区分多个正常预览。 */
    let instanceId = sessionStorage.getItem(storageKey);
    if (!instanceId) {
        const random = new Uint32Array(4);
        crypto.getRandomValues(random);
        instanceId = Array.from(random, value => value.toString(36)).join('-');
        sessionStorage.setItem(storageKey, instanceId);
    }

    /** 返回 Creator 注册类名，无法识别时使用构造函数名。 */
    function className(cc, value) {
        return cc.js.getClassName(value) || value?.constructor?.name || '<unknown>';
    }

    /** 运行时节点树面板使用的 DOM ID，避免重复安装。 */
    const panelId = 'cocos-runtime-node-tree-panel';
    /** 节点树面板一次最多渲染的行数，避免搜索结果过多时阻塞预览页。 */
    const maxRenderedRows = 2000;
    /** 当前节点树快照，仅在打开面板或手动刷新时重建。 */
    let nodeTreeSnapshot = null;
    /** 当前已展开节点的快照 ID。 */
    const expandedNodeIds = new Set();
    /** 当前选中节点的快照 ID。 */
    let selectedNodeId = 0;

    /** 按唯一层级路径查找运行时节点。 */
    function findRoot(scene, selector) {
        if (!selector || selector === '/' || selector === scene.name) return scene;
        const parts = String(selector).replaceAll('\\', '/').split('/').filter(Boolean);
        if (parts[0] === scene.name) parts.shift();
        let current = scene;
        for (const part of parts) {
            const matches = current.children.filter(child => child.name === part);
            if (matches.length === 0) throw new Error(`runtime node path not found at: ${part}`);
            if (matches.length > 1) throw new Error(`runtime node path is ambiguous at: ${part}`);
            current = matches[0];
        }
        return current;
    }

    /** 仅在收到 Skill 请求时遍历一次当前运行时节点树。 */
    async function captureNodeStats(options) {
        if (!globalThis.System?.import) throw new Error('Cocos SystemJS runtime is not ready');
        const cc = await globalThis.System.import('cc');
        const scene = cc.director.getScene();
        if (!scene) throw new Error('no running Cocos scene');
        const root = findRoot(scene, options?.root);
        const stack = [{ node: root, depth: 0 }];
        const nodesByDepth = new Map();
        const nodesByLayer = new Map();
        const componentTypes = new Map();
        let nodeCount = 0;
        let activeNodeCount = 0;
        let componentCount = 0;
        let enabledComponentCount = 0;
        let maxDepth = 0;

        while (stack.length > 0) {
            const entry = stack.pop();
            const node = entry.node;
            nodeCount++;
            if (node.activeInHierarchy) activeNodeCount++;
            maxDepth = Math.max(maxDepth, entry.depth);
            nodesByDepth.set(entry.depth, (nodesByDepth.get(entry.depth) ?? 0) + 1);
            nodesByLayer.set(node.layer, (nodesByLayer.get(node.layer) ?? 0) + 1);

            const components = node.components;
            componentCount += components.length;
            for (let i = 0; i < components.length; i++) {
                const component = components[i];
                if (component.enabledInHierarchy) enabledComponentCount++;
                const type = className(cc, component);
                const count = componentTypes.get(type) ?? { type, count: 0, enabled: 0 };
                count.count++;
                if (component.enabledInHierarchy) count.enabled++;
                componentTypes.set(type, count);
            }
            for (let i = node.children.length - 1; i >= 0; i--) {
                stack.push({ node: node.children[i], depth: entry.depth + 1 });
            }
        }

        const topComponents = Number.isInteger(options?.topComponents)
            ? Math.max(0, Math.min(100, options.topComponents))
            : 30;
        return {
            instanceId,
            capturedAt: new Date().toISOString(),
            page: {
                title: document.title,
                url: location.href,
                visibility: document.visibilityState
            },
            scene: scene.name,
            root: root.getPathInHierarchy(),
            nodeCount,
            activeNodeCount,
            inactiveNodeCount: nodeCount - activeNodeCount,
            componentCount,
            enabledComponentCount,
            disabledComponentCount: componentCount - enabledComponentCount,
            maxDepth,
            nodesByDepth: [...nodesByDepth.entries()].map(([depth, count]) => ({ depth, count })),
            nodesByLayer: [...nodesByLayer.entries()]
                .map(([layer, count]) => ({ layer, count }))
                .sort((left, right) => right.count - left.count),
            topComponentTypes: [...componentTypes.values()]
                .sort((left, right) => right.count - left.count || left.type.localeCompare(right.type))
                .slice(0, topComponents)
        };
    }

    /**
     * 生成供预览面板展示的一次性节点树快照。
     * 快照通过弱引用关联引擎节点，场景结构变化后需由用户手动刷新。
     */
    async function captureNodeTree() {
        if (!globalThis.System?.import) throw new Error('Cocos SystemJS runtime is not ready');
        const cc = await globalThis.System.import('cc');
        const scene = cc.director.getScene();
        if (!scene) throw new Error('no running Cocos scene');

        const nodes = [];
        const nodesById = new Map();
        /** 将运行时节点引用映射到快照 ID，用于从游戏点击快速定位节点树行。 */
        const nodeIdsByReference = new WeakMap();
        const stack = [{ node: scene, parentId: 0, depth: 0 }];
        let activeNodeCount = 0;
        let componentCount = 0;

        while (stack.length > 0) {
            const entry = stack.pop();
            const node = entry.node;
            const id = nodes.length + 1;
            const components = [];
            for (let i = 0; i < node.components.length; i++) {
                const component = node.components[i];
                const type = className(cc, component);
                components.push({
                    type,
                    enabled: component.enabled,
                    enabledInHierarchy: component.enabledInHierarchy,
                    componentReference: new WeakRef(component)
                });
            }

            const item = {
                id,
                parentId: entry.parentId,
                depth: entry.depth,
                nodeReference: new WeakRef(node),
                name: node.name,
                path: node.getPathInHierarchy(),
                active: node.active,
                activeInHierarchy: node.activeInHierarchy,
                layer: node.layer,
                siblingIndex: node.getSiblingIndex(),
                childIds: [],
                components
            };
            nodes.push(item);
            nodesById.set(id, item);
            nodeIdsByReference.set(node, id);
            if (entry.parentId) nodesById.get(entry.parentId)?.childIds.push(id);
            if (node.activeInHierarchy) activeNodeCount++;
            componentCount += components.length;

            for (let i = node.children.length - 1; i >= 0; i--) {
                stack.push({ node: node.children[i], parentId: id, depth: entry.depth + 1 });
            }
        }

        const layerOptions = [];
        const layerList = cc.Enum.getList(cc.Layers.Enum);
        for (let i = 0; i < layerList.length; i++) {
            if (layerList[i].name !== 'ALL') layerOptions.push({ name: layerList[i].name, value: layerList[i].value });
        }

        return {
            scene: scene.name,
            capturedAt: new Date(),
            nodes,
            nodesById,
            nodeIdsByReference,
            nodeCount: nodes.length,
            activeNodeCount,
            componentCount,
            layerOptions
        };
    }

    /** 创建节点树面板所需样式。 */
    function installPanelStyle() {
        if (document.getElementById(`${panelId}-style`)) return;
        const style = document.createElement('style');
        style.id = `${panelId}-style`;
        style.textContent = `
            :root { --rnt-panel-width: min(430px, calc(100vw - 160px)); }
            #${panelId}, #${panelId} * { box-sizing: border-box; }
            #content { transition: margin-left .18s ease, width .18s ease; }
            body.cocos-runtime-node-tree-open #content { width: calc(100% - var(--rnt-panel-width)); margin-left: var(--rnt-panel-width); }
            #${panelId} { position: fixed; top: 50px; left: 0; bottom: 0; width: var(--rnt-panel-width); z-index: 2147483646; display: flex; flex-direction: column; overflow: hidden; visibility: hidden; pointer-events: none; transform: translateX(-100%); color: #d8dee9; background: rgba(28, 31, 38, .97); border: 1px solid #4b5263; border-left: 0; border-bottom: 0; border-radius: 0 8px 0 0; box-shadow: 10px 0 28px rgba(0, 0, 0, .38); transition: transform .18s ease, visibility 0s linear .18s; font: 12px/1.45 Consolas, "Microsoft YaHei", sans-serif; }
            #${panelId}.is-open { visibility: visible; pointer-events: auto; transform: translateX(0); transition-delay: 0s; }
            #${panelId} button, #${panelId} input, #${panelId} select { font: inherit; }
            #${panelId} button { color: #d8dee9; background: #3a404c; border: 1px solid #596273; border-radius: 4px; cursor: pointer; }
            #${panelId} button:hover { background: #485161; }
            #${panelId} .rnt-header { display: flex; align-items: center; gap: 6px; min-height: 42px; padding: 7px 8px; border-bottom: 1px solid #454b57; }
            #${panelId} .rnt-title { flex: 1; min-width: 0; font-weight: 700; color: #f0f3f7; }
            #${panelId} .rnt-header button { height: 27px; padding: 0 8px; }
            #${panelId} .rnt-tools { display: flex; gap: 6px; padding: 7px 8px; border-bottom: 1px solid #454b57; }
            #${panelId} .rnt-search { flex: 0 1 250px; width: 250px; min-width: 110px; height: 28px; padding: 0 8px; color: #eef1f5; background: #20242b; border: 1px solid #555e6d; border-radius: 4px; outline: none; }
            #${panelId} .rnt-search:focus { border-color: #67a9ff; }
            #${panelId} .rnt-picking-control { flex: 0 0 auto; display: flex; align-items: center; gap: 5px; height: 28px; margin-left: auto; color: #c8d0dc; font-size: 13px; line-height: 26px; white-space: nowrap; }
            #${panelId} .rnt-picking-control > span { display: flex; align-items: center; height: 26px; font-size: 13px; line-height: 26px; }
            #${panelId} .rnt-picking-mode-wrap { position: relative; flex: 0 0 82px; width: 82px; height: 26px; }
            #${panelId} .rnt-picking-mode { position: absolute; width: 1px; height: 1px; opacity: 0; pointer-events: none; }
            #${panelId} button.rnt-picking-current { display: flex; align-items: center; justify-content: center; width: 82px; height: 26px; padding: 0 10px 0 0; color: #e5e9ef; background: #20242b url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23cbd3df' stroke-width='1.5'/%3E%3C/svg%3E") no-repeat right 6px center / 10px 6px; border: 1px solid #596273; border-radius: 3px; font-size: 13px; line-height: 26px; text-align: center; }
            #${panelId} button.rnt-picking-current:focus { border-color: #67a9ff; outline: none; }
            #${panelId} .rnt-picking-menu { position: absolute; top: 27px; left: 0; z-index: 20; display: none; width: 82px; padding: 0; background: #20242b; border: 1px solid #596273; box-shadow: 0 4px 10px rgba(0, 0, 0, .38); }
            #${panelId} .rnt-picking-mode-wrap.is-open .rnt-picking-menu { display: block; }
            #${panelId} button.rnt-picking-option { display: flex; align-items: center; justify-content: center; width: 80px; height: 24px; padding: 0 10px 0 0; color: #e5e9ef; background: #20242b; border: 0; border-radius: 0; font-size: 13px; line-height: 24px; text-align: center; }
            #${panelId} button.rnt-picking-option:hover { background: #31577f; }
            #${panelId} button.rnt-picking-option.is-selected { background: #1976d2; }
            body.cocos-runtime-node-picking #GameCanvas { cursor: crosshair !important; }
            #${panelId}-selection-outline { position: fixed; z-index: 2147483644; display: none; box-sizing: border-box; border: 2px solid #58a6ff; background: rgba(88, 166, 255, .08); box-shadow: 0 0 0 1px rgba(12, 18, 28, .9), inset 0 0 0 1px rgba(255, 255, 255, .22); pointer-events: none; }
            #${panelId}-selection-outline.is-visible { display: block; }
            #${panelId}-selection-outline-label { position: absolute; left: -2px; bottom: 100%; max-width: 260px; margin-bottom: 3px; padding: 2px 5px; color: #ffffff; background: #3578b8; border-radius: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 11px/1.4 Consolas, "Microsoft YaHei", sans-serif; }
            #${panelId} .rnt-summary { padding: 5px 8px; color: #9da8b8; border-bottom: 1px solid #3d424d; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            #${panelId} .rnt-tree { flex: 1 1 55%; min-height: 100px; overflow: auto; padding: 4px 0; user-select: none; }
            #${panelId} .rnt-row { display: flex; align-items: center; min-width: max-content; height: 23px; padding-right: 8px; color: #d8dee9; cursor: default; }
            #${panelId} .rnt-row:hover { background: #353b46; }
            #${panelId} .rnt-row.is-selected { background: #31577f; }
            #${panelId} .rnt-row.is-inactive { color: #777f8c; }
            #${panelId} .rnt-toggle { width: 22px; height: 21px; padding: 0; border: 0; background: transparent; color: #c2cad5; font-size: 17px; line-height: 19px; }
            #${panelId} .rnt-toggle:hover { background: #485161; }
            #${panelId} .rnt-toggle-placeholder { flex: 0 0 22px; width: 22px; height: 21px; pointer-events: none; }
            #${panelId} .rnt-visibility { flex: 0 0 auto; width: 14px; height: 14px; margin: 0 3px 0 auto; accent-color: #5ca7f7; cursor: pointer; }
            #${panelId} .rnt-visibility:disabled { cursor: not-allowed; opacity: .45; }
            #${panelId} .rnt-node-name { padding: 1px 4px; white-space: nowrap; }
            #${panelId} .rnt-badge { margin-left: 5px; padding: 0 4px; color: #9db7d5; background: #313844; border-radius: 7px; font-size: 10px; }
            #${panelId} .rnt-empty { padding: 18px 12px; color: #929baa; text-align: center; }
            #${panelId} .rnt-details { flex: 0 1 38%; min-height: 112px; overflow: auto; padding: 8px 10px; border-top: 1px solid #535b69; background: #252a32; user-select: text; }
            #${panelId} .rnt-details-title { margin-bottom: 6px; color: #f0f3f7; font-weight: 700; overflow-wrap: anywhere; }
            #${panelId} .rnt-details-heading { display: flex; align-items: center; min-height: 20px; margin-bottom: 6px; }
            #${panelId} .rnt-details-heading > .rnt-details-title { flex: 1 1 auto; min-width: 0; margin: 0; }
            #${panelId} .rnt-details-visibility { flex: 0 0 auto; width: 14px; height: 14px; margin: 0 6px 0 0; accent-color: #5ca7f7; cursor: pointer; }
            #${panelId} .rnt-details-visibility:disabled { cursor: not-allowed; opacity: .45; }
            #${panelId} .rnt-node-actions { display: flex; flex: 0 0 auto; align-items: center; gap: 2px; margin-left: 6px; }
            #${panelId} .rnt-node-action { width: 25px; height: 22px; padding: 0; color: #aeb9c8; background: transparent; border: 0; font-size: 16px; line-height: 20px; }
            #${panelId} .rnt-node-action:hover { color: #ffffff; background: #485161; }
            #${panelId} .rnt-property { display: grid; grid-template-columns: 82px 1fr; gap: 7px; margin: 3px 0; }
            #${panelId} .rnt-property-key { color: #8995a6; }
            #${panelId} .rnt-property-value { color: #cdd5df; overflow-wrap: anywhere; }
            #${panelId} .rnt-editor-section { margin-top: 9px; padding: 7px; background: #2d333c; border: 1px solid #414956; border-radius: 4px; }
            #${panelId} .rnt-editor-title { display: flex; align-items: center; min-width: 0; margin: 0; color: #e7ebf0; font-weight: 700; cursor: pointer; user-select: none; }
            #${panelId} summary.rnt-editor-title { list-style: none; }
            #${panelId} summary.rnt-editor-title::-webkit-details-marker { display: none; }
            #${panelId} summary.rnt-editor-title::before { flex: 0 0 18px; width: 18px; margin-right: 5px; content: '▸'; color: #c2cad5; font-size: 17px; line-height: 1; text-align: center; }
            #${panelId} details[open] > summary.rnt-editor-title::before { content: '▾'; }
            #${panelId} .rnt-editor-section[open] .rnt-editor-title { margin-bottom: 6px; }
            #${panelId} .rnt-node-editor > .rnt-editor-title { margin-bottom: 6px; cursor: default; }
            #${panelId} .rnt-component-name { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
            #${panelId} .rnt-component-static > .rnt-editor-title { cursor: default; }
            #${panelId} .rnt-print-component { flex: 0 0 auto; width: 25px; height: 22px; margin-left: auto; padding: 0; line-height: 20px; color: #aeb9c8; background: transparent; border: 0; }
            #${panelId} .rnt-print-component:hover { color: #ffffff; background: #485161; }
            #${panelId} .rnt-editor-row { display: grid; grid-template-columns: 76px minmax(0, 1fr); align-items: center; gap: 6px; margin-top: 5px; }
            #${panelId} .rnt-editor-label { color: #9ca7b6; }
            #${panelId} .rnt-editor-fields { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 4px; }
            #${panelId} .rnt-number-field { display: grid; grid-template-columns: 12px minmax(0, 1fr); align-items: center; gap: 2px; }
            #${panelId} .rnt-axis { color: #788596; text-align: center; }
            #${panelId} .rnt-number-input, #${panelId} .rnt-select { width: 100%; min-width: 0; height: 24px; padding: 1px 4px; color: #e5e9ef; background: #20242b; border: 1px solid #515b6a; border-radius: 3px; outline: none; }
            #${panelId} .rnt-number-input:focus, #${panelId} .rnt-select:focus { border-color: #67a9ff; }
            #${panelId} .rnt-number-input:disabled, #${panelId} .rnt-select:disabled { opacity: .55; }
            #${panelId} .rnt-component-panel { margin-top: 5px; }
            #${panelId} .rnt-component-panel.is-disabled > .rnt-editor-title { color: #858d99; }
            #${panelId}-toggle { position: fixed; top: 50%; left: 0; z-index: 2147483647; padding: 8px 4px; color: #dce5ef; background: rgba(34, 39, 47, .88); border: 1px solid #596273; border-left: 0; border-radius: 0 5px 5px 0; cursor: pointer; font: 12px/1.2 "Microsoft YaHei", sans-serif; writing-mode: vertical-rl; transition: left .18s ease; }
            body.cocos-runtime-node-tree-open #${panelId}-toggle { left: var(--rnt-panel-width); }
        `;
        document.head.appendChild(style);
    }

    /** 创建带文本内容的 DOM 元素。 */
    function createElement(tagName, classNameValue, textValue) {
        const element = document.createElement(tagName);
        if (classNameValue) element.className = classNameValue;
        if (textValue !== undefined) element.textContent = textValue;
        return element;
    }

    /** 向详情区域添加一行只读属性。 */
    function appendProperty(container, key, value) {
        const row = createElement('div', 'rnt-property');
        row.appendChild(createElement('span', 'rnt-property-key', key));
        row.appendChild(createElement('span', 'rnt-property-value', String(value)));
        container.appendChild(row);
    }

    /** 安装预览专用运行时节点树面板。 */
    function installNodeTreePanel() {
        if (document.getElementById(panelId)) return;
        installPanelStyle();

        const panel = createElement('section');
        panel.id = panelId;
        panel.setAttribute('aria-label', '运行时节点树');

        const header = createElement('div', 'rnt-header');
        const title = createElement('div', 'rnt-title', '运行时节点树');
        const refreshButton = createElement('button', '', '刷新');
        const collapseButton = createElement('button', '', '全部收起');
        const closeButton = createElement('button', '', '关闭');
        header.append(title, refreshButton, collapseButton, closeButton);

        const tools = createElement('div', 'rnt-tools');
        const search = createElement('input', 'rnt-search');
        search.type = 'search';
        search.placeholder = '搜索节点或组件；路径请包含 /';
        /** 上一次树渲染使用的搜索词，用于识别用户清空搜索的时机。 */
        let previousSearchQuery = '';
        const pickingControl = createElement('div', 'rnt-picking-control');
        pickingControl.title = '交互节点：仅拾取响应指针事件的节点；所有节点：拾取鼠标位置下的 UITransform，重复点击同一位置可循环重叠节点';
        const pickingModeSelect = createElement('select', 'rnt-picking-mode');
        const pickingModeOptions = [
            { value: 'off', text: '关闭' },
            { value: 'interactive', text: '交互节点' },
            { value: 'all', text: '所有节点' }
        ];
        const pickingModeMenu = createElement('div', 'rnt-picking-menu');
        pickingModeMenu.setAttribute('role', 'listbox');
        const pickingModeButtons = [];
        for (let i = 0; i < pickingModeOptions.length; i++) {
            const option = createElement('option', '', pickingModeOptions[i].text);
            option.value = pickingModeOptions[i].value;
            pickingModeSelect.appendChild(option);
            const optionButton = createElement('button', 'rnt-picking-option', pickingModeOptions[i].text);
            optionButton.type = 'button';
            optionButton.dataset.value = pickingModeOptions[i].value;
            optionButton.setAttribute('role', 'option');
            pickingModeButtons.push(optionButton);
            pickingModeMenu.appendChild(optionButton);
        }
        const pickingModeWrap = createElement('span', 'rnt-picking-mode-wrap');
        const pickingModeCurrent = createElement('button', 'rnt-picking-current', pickingModeOptions[0].text);
        pickingModeCurrent.type = 'button';
        pickingModeCurrent.setAttribute('aria-haspopup', 'listbox');
        pickingModeCurrent.setAttribute('aria-expanded', 'false');
        pickingModeWrap.append(pickingModeSelect, pickingModeCurrent, pickingModeMenu);
        pickingControl.append(createElement('span', '', '拾取'), pickingModeWrap);
        tools.append(search, pickingControl);

        /** 打开或关闭拾取模式菜单，并同步无障碍展开状态。 */
        function setPickingMenuOpen(open) {
            pickingModeWrap.classList.toggle('is-open', open);
            pickingModeCurrent.setAttribute('aria-expanded', String(open));
        }

        /** 将隐藏的模式值同步到当前文字与三个自定义选项。 */
        function syncPickingModeControl() {
            const selectedOption = pickingModeOptions.find(option => option.value === pickingModeSelect.value);
            pickingModeCurrent.textContent = selectedOption?.text ?? '';
            for (let i = 0; i < pickingModeButtons.length; i++) {
                const selected = pickingModeButtons[i].dataset.value === pickingModeSelect.value;
                pickingModeButtons[i].classList.toggle('is-selected', selected);
                pickingModeButtons[i].setAttribute('aria-selected', String(selected));
            }
        }

        pickingModeCurrent.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            setPickingMenuOpen(!pickingModeWrap.classList.contains('is-open'));
        });
        for (let i = 0; i < pickingModeButtons.length; i++) {
            pickingModeButtons[i].addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                pickingModeSelect.value = pickingModeButtons[i].dataset.value ?? 'off';
                setPickingMenuOpen(false);
                pickingModeSelect.dispatchEvent(new Event('change'));
            });
        }
        syncPickingModeControl();

        const summary = createElement('div', 'rnt-summary', '打开面板后读取节点树');
        const tree = createElement('div', 'rnt-tree');
        const details = createElement('div', 'rnt-details');
        details.appendChild(createElement('div', 'rnt-empty', '选择节点查看详情'));
        panel.append(header, tools, summary, tree, details);
        document.body.appendChild(panel);

        /** 面板推开内容区后通知 Creator 重新计算画布尺寸和输入坐标。 */
        const previewContent = document.getElementById('content');
        previewContent?.addEventListener('transitionend', event => {
            if (event.propertyName === 'width') window.dispatchEvent(new Event('resize'));
        });

        const edgeToggle = createElement('button', '', '节点树');
        edgeToggle.id = `${panelId}-toggle`;
        edgeToggle.title = '打开运行时节点树（Ctrl + `）';
        document.body.appendChild(edgeToggle);

        const selectionOutline = createElement('div');
        selectionOutline.id = `${panelId}-selection-outline`;
        const selectionOutlineLabel = createElement('div');
        selectionOutlineLabel.id = `${panelId}-selection-outline-label`;
        selectionOutline.appendChild(selectionOutlineLabel);
        document.body.appendChild(selectionOutline);

        /** 当前游戏点击定位观察器的绑定信息。 */
        let previewSelectionBinding = null;
        /** 游戏点击定位观察器的异步更新序号，用于丢弃过期绑定。 */
        let previewSelectionGeneration = 0;
        /** 最近一次游戏预览点击定位请求序号，用于丢弃过期快照。 */
        let previewSelectionRequest = 0;
        /** 当前选中节点范围框的事件绑定及坐标缓存。 */
        let selectedOutlineBinding = null;
        /** 节点范围框异步绑定序号，用于丢弃过期选择。 */
        let selectedOutlineGeneration = 0;
        /** 等待执行的节点范围框更新帧。 */
        let selectedOutlineFrame = 0;
        /** “所有节点”模式判断同一拾取位置时允许的鼠标误差，单位为 CSS 像素。 */
        const allNodePickingTolerance = 6;
        /** “所有节点”模式当前近似位置已经依次拾取过的节点。 */
        const allNodePickingCycle = {
            clientX: Number.NaN,
            clientY: Number.NaN,
            pickedNodes: new Set()
        };

        const gameCanvas = document.getElementById('GameCanvas');

        /** 清空“所有节点”模式的同点循环记录。 */
        function resetAllNodePickingCycle() {
            allNodePickingCycle.clientX = Number.NaN;
            allNodePickingCycle.clientY = Number.NaN;
            allNodePickingCycle.pickedNodes.clear();
        }

        /** 返回当前拾取模式：off、interactive 或 all。 */
        function getPickingMode() {
            return pickingModeSelect.value;
        }

        /** 返回节点树面板当前是否处于任一拾取模式。 */
        function isPickingEnabled() {
            return panel.classList.contains('is-open') && getPickingMode() !== 'off';
        }

        /** 在“所有节点”模式下阻止游戏输入，并在指针抬起时执行全节点命中检测。 */
        function onAllNodePickingPointerEvent(event) {
            if (!panel.classList.contains('is-open') || getPickingMode() !== 'all') return;
            event.preventDefault();
            event.stopImmediatePropagation();
            if (event.type === 'pointerup') {
                void selectAllPreviewNodeAt(event.clientX, event.clientY).catch(error => {
                    summary.textContent = `节点拾取失败：${error instanceof Error ? error.message : String(error)}`;
                });
            }
        }
        const allNodePointerEventTypes = ['pointerdown', 'pointermove', 'pointerup', 'pointercancel'];
        for (let i = 0; i < allNodePointerEventTypes.length; i++) {
            gameCanvas?.addEventListener(allNodePointerEventTypes[i], onAllNodePickingPointerEvent, true);
        }

        /** 展开指定快照节点的全部父级。 */
        function expandSnapshotAncestors(item) {
            let current = item;
            while (current?.parentId) {
                current = nodeTreeSnapshot.nodesById.get(current.parentId);
                if (current) expandedNodeIds.add(current.id);
            }
        }

        /** 选择游戏预览事件命中的运行时节点，并在必要时刷新过期快照。 */
        async function selectPreviewEventNode(node) {
            if (!panel.classList.contains('is-open')
                || getPickingMode() === 'off'
                || !node
                || typeof node !== 'object') return;
            const request = ++previewSelectionRequest;
            let id = nodeTreeSnapshot?.nodeIdsByReference.get(node);
            if (!id) {
                const refreshedSnapshot = await captureNodeTree();
                if (request !== previewSelectionRequest
                    || !panel.classList.contains('is-open')
                    || getPickingMode() === 'off') return;
                nodeTreeSnapshot = refreshedSnapshot;
                id = nodeTreeSnapshot.nodeIdsByReference.get(node);
                summary.textContent = `${nodeTreeSnapshot.scene} · ${nodeTreeSnapshot.nodeCount} 节点 · ${nodeTreeSnapshot.activeNodeCount} 激活 · ${nodeTreeSnapshot.componentCount} 组件 · ${nodeTreeSnapshot.capturedAt.toLocaleTimeString()}`;
            }
            const item = nodeTreeSnapshot?.nodesById.get(id);
            if (!item) return;

            search.value = '';
            previousSearchQuery = '';
            selectedNodeId = item.id;
            expandSnapshotAncestors(item);
            renderTree();
            renderDetails();
            requestAnimationFrame(() => {
                tree.querySelector(`[data-node-id="${item.id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            });
        }

        /** 在鼠标位置下检测全部有效 UITransform，并拾取相机优先级和绘制顺序最靠前的节点。 */
        async function selectAllPreviewNodeAt(clientX, clientY) {
            if (!gameCanvas || !panel.classList.contains('is-open') || getPickingMode() !== 'all') return;
            const cc = await globalThis.System.import('cc');
            if (!panel.classList.contains('is-open') || getPickingMode() !== 'all') return;
            const scene = cc.director.getScene();
            const canvasRect = gameCanvas.getBoundingClientRect();
            if (!scene || canvasRect.width <= 0 || canvasRect.height <= 0) return;

            const screenPoint = new cc.Vec2(
                (clientX - canvasRect.left) * gameCanvas.width / canvasRect.width,
                (canvasRect.bottom - clientY) * gameCanvas.height / canvasRect.height
            );
            const nodes = [];
            const stack = [scene];
            while (stack.length > 0) {
                const node = stack.pop();
                nodes.push(node);
                for (let i = node.children.length - 1; i >= 0; i--) stack.push(node.children[i]);
            }

            const deltaX = clientX - allNodePickingCycle.clientX;
            const deltaY = clientY - allNodePickingCycle.clientY;
            const isSamePosition = Number.isFinite(deltaX)
                && Number.isFinite(deltaY)
                && deltaX * deltaX + deltaY * deltaY <= allNodePickingTolerance * allNodePickingTolerance;
            if (!isSamePosition) {
                resetAllNodePickingCycle();
                allNodePickingCycle.clientX = clientX;
                allNodePickingCycle.clientY = clientY;
            }

            const hitCandidates = [];
            for (let i = nodes.length - 1; i >= 0; i--) {
                const node = nodes[i];
                if (!node.activeInHierarchy) continue;
                const uiTransform = node.getComponent(cc.UITransform);
                if (!uiTransform?.enabledInHierarchy || !uiTransform.hitTest(screenPoint, 0)) continue;
                hitCandidates.push({
                    node,
                    cameraPriority: uiTransform.cameraPriority,
                    reverseTreeOrder: hitCandidates.length
                });
            }
            hitCandidates.sort((left, right) => right.cameraPriority - left.cameraPriority
                || left.reverseTreeOrder - right.reverseTreeOrder);

            let targetNode = null;
            for (let i = 0; i < hitCandidates.length; i++) {
                if (allNodePickingCycle.pickedNodes.has(hitCandidates[i].node)) continue;
                targetNode = hitCandidates[i].node;
                break;
            }
            if (!targetNode && hitCandidates.length > 0) {
                allNodePickingCycle.pickedNodes.clear();
                targetNode = hitCandidates[0].node;
            }
            if (!targetNode) {
                resetAllNodePickingCycle();
                return;
            }
            allNodePickingCycle.pickedNodes.add(targetNode);
            await selectPreviewEventNode(targetNode);
        }

        /** 根据拾取模式安装或移除可逆的 Cocos 节点事件观察器。 */
        async function setPreviewSelectionEnabled(enabled) {
            const generation = ++previewSelectionGeneration;
            if (previewSelectionBinding) {
                const binding = previewSelectionBinding;
                previewSelectionBinding = null;
                if (binding.nodePrototype.dispatchEvent === binding.observer) {
                    binding.nodePrototype.dispatchEvent = binding.originalDispatchEvent;
                }
            }
            if (!enabled) return;

            const cc = await globalThis.System.import('cc');
            if (generation !== previewSelectionGeneration
                || !panel.classList.contains('is-open')
                || getPickingMode() === 'off') return;
            const nodePrototype = cc.Node.prototype;
            const originalDispatchEvent = nodePrototype.dispatchEvent;
            const selectionEventTypes = new Set([cc.Node.EventType.TOUCH_END, cc.Node.EventType.MOUSE_UP]);
            const blockedEventTypes = new Set([
                cc.Node.EventType.TOUCH_START,
                cc.Node.EventType.TOUCH_MOVE,
                cc.Node.EventType.TOUCH_END,
                cc.Node.EventType.TOUCH_CANCEL,
                cc.Node.EventType.MOUSE_DOWN,
                cc.Node.EventType.MOUSE_UP
            ]);
            const observedEvents = new WeakSet();
            /** 拾取模式下拦截游戏指针事件，并在点击结束时选中命中的节点。 */
            function dispatchEventWithPreviewSelection(event) {
                const pickingMode = panel.classList.contains('is-open') ? getPickingMode() : 'off';
                const isPicking = pickingMode !== 'off';
                const shouldBlock = isPicking
                    && event
                    && blockedEventTypes.has(event.type);
                const shouldSelect = pickingMode === 'interactive'
                    && shouldBlock
                    && selectionEventTypes.has(event.type)
                    && !observedEvents.has(event);
                if (shouldSelect) {
                    observedEvents.add(event);
                    queueMicrotask(() => { observedEvents.delete(event); });
                }
                if (shouldSelect) {
                    void selectPreviewEventNode(this).catch(error => {
                        summary.textContent = `点击定位失败：${error instanceof Error ? error.message : String(error)}`;
                    });
                }
                if (shouldBlock) return;
                return originalDispatchEvent.call(this, event);
            }
            nodePrototype.dispatchEvent = dispatchEventWithPreviewSelection;
            previewSelectionBinding = {
                nodePrototype,
                originalDispatchEvent,
                observer: dispatchEventWithPreviewSelection
            };
        }

        /** 解除当前选中节点范围框使用的引擎事件监听。 */
        function clearSelectedOutlineBinding() {
            if (selectedOutlineFrame) {
                cancelAnimationFrame(selectedOutlineFrame);
                selectedOutlineFrame = 0;
            }
            if (selectedOutlineBinding) {
                const binding = selectedOutlineBinding;
                selectedOutlineBinding = null;
                for (let i = 0; i < binding.events.length; i++) {
                    const entry = binding.events[i];
                    entry.node.off(entry.type, scheduleSelectedOutlineUpdate);
                }
                window.removeEventListener('resize', scheduleSelectedOutlineUpdate);
            }
            selectionOutline.classList.remove('is-visible');
        }

        /** 将当前选中 UITransform 的四个角点换算为画布上的可见矩形。 */
        function updateSelectedOutline() {
            selectedOutlineFrame = 0;
            const binding = selectedOutlineBinding;
            if (!binding) return;
            const { cc, node, uiTransform, localCorners, worldCorners, screenCorners } = binding;
            if (!panel.classList.contains('is-open')
                || getPickingMode() === 'off'
                || !cc.isValid(node)
                || !node.activeInHierarchy
                || !gameCanvas) {
                selectionOutline.classList.remove('is-visible');
                return;
            }
            const camera = cc.director.root?.batcher2D?.getFirstRenderCamera(node);
            const canvasRect = gameCanvas.getBoundingClientRect();
            if (!camera || canvasRect.width <= 0 || canvasRect.height <= 0 || camera.width <= 0 || camera.height <= 0) {
                selectionOutline.classList.remove('is-visible');
                return;
            }

            const size = uiTransform.contentSize;
            const anchor = uiTransform.anchorPoint;
            const left = -anchor.x * size.width;
            const right = left + size.width;
            const bottom = -anchor.y * size.height;
            const top = bottom + size.height;
            localCorners[0].set(left, bottom, 0);
            localCorners[1].set(right, bottom, 0);
            localCorners[2].set(right, top, 0);
            localCorners[3].set(left, top, 0);

            let minX = Number.POSITIVE_INFINITY;
            let minY = Number.POSITIVE_INFINITY;
            let maxX = Number.NEGATIVE_INFINITY;
            let maxY = Number.NEGATIVE_INFINITY;
            const worldMatrix = node.worldMatrix;
            for (let i = 0; i < localCorners.length; i++) {
                cc.Vec3.transformMat4(worldCorners[i], localCorners[i], worldMatrix);
                camera.worldToScreen(screenCorners[i], worldCorners[i]);
                minX = Math.min(minX, screenCorners[i].x);
                minY = Math.min(minY, screenCorners[i].y);
                maxX = Math.max(maxX, screenCorners[i].x);
                maxY = Math.max(maxY, screenCorners[i].y);
            }

            const scaleX = canvasRect.width / camera.width;
            const scaleY = canvasRect.height / camera.height;
            const outlineLeft = Math.max(canvasRect.left, canvasRect.left + minX * scaleX);
            const outlineRight = Math.min(canvasRect.right, canvasRect.left + maxX * scaleX);
            const outlineTop = Math.max(canvasRect.top, canvasRect.bottom - maxY * scaleY);
            const outlineBottom = Math.min(canvasRect.bottom, canvasRect.bottom - minY * scaleY);
            if (outlineRight <= outlineLeft || outlineBottom <= outlineTop) {
                selectionOutline.classList.remove('is-visible');
                return;
            }
            selectionOutline.style.left = `${outlineLeft}px`;
            selectionOutline.style.top = `${outlineTop}px`;
            selectionOutline.style.width = `${outlineRight - outlineLeft}px`;
            selectionOutline.style.height = `${outlineBottom - outlineTop}px`;
            selectionOutlineLabel.textContent = node.name;
            selectionOutline.classList.add('is-visible');
        }

        /** 将连续的 Transform/尺寸变化合并到下一动画帧更新一次范围框。 */
        function scheduleSelectedOutlineUpdate() {
            if (selectedOutlineFrame || !selectedOutlineBinding) return;
            selectedOutlineFrame = requestAnimationFrame(updateSelectedOutline);
        }

        /** 根据面板当前选择建立节点范围框，不对无 UITransform 的节点绘制虚假尺寸。 */
        async function syncSelectedOutline() {
            const item = nodeTreeSnapshot?.nodesById.get(selectedNodeId);
            const itemNode = item?.nodeReference.deref();
            if (selectedOutlineBinding?.itemId === item?.id
                && selectedOutlineBinding.node === itemNode
                && getPickingMode() !== 'off'
                && panel.classList.contains('is-open')) {
                scheduleSelectedOutlineUpdate();
                return;
            }
            const generation = ++selectedOutlineGeneration;
            clearSelectedOutlineBinding();
            if (!item || !panel.classList.contains('is-open') || getPickingMode() === 'off') return;

            const cc = await globalThis.System.import('cc');
            if (generation !== selectedOutlineGeneration
                || !panel.classList.contains('is-open')
                || getPickingMode() === 'off') return;
            const node = itemNode;
            if (!node || !cc.isValid(node)) return;
            const uiTransform = node.getComponent(cc.UITransform);
            if (!uiTransform) return;

            const events = [];
            let current = node;
            while (current) {
                current.on(cc.Node.EventType.TRANSFORM_CHANGED, scheduleSelectedOutlineUpdate);
                events.push({ node: current, type: cc.Node.EventType.TRANSFORM_CHANGED });
                current = current.parent;
            }
            const nodeEventTypes = [
                cc.Node.EventType.SIZE_CHANGED,
                cc.Node.EventType.ANCHOR_CHANGED,
                cc.Node.EventType.ACTIVE_IN_HIERARCHY_CHANGED
            ];
            for (let i = 0; i < nodeEventTypes.length; i++) {
                node.on(nodeEventTypes[i], scheduleSelectedOutlineUpdate);
                events.push({ node, type: nodeEventTypes[i] });
            }
            window.addEventListener('resize', scheduleSelectedOutlineUpdate);
            selectedOutlineBinding = {
                itemId: item.id,
                cc,
                node,
                uiTransform,
                events,
                localCorners: [new cc.Vec3(), new cc.Vec3(), new cc.Vec3(), new cc.Vec3()],
                worldCorners: [new cc.Vec3(), new cc.Vec3(), new cc.Vec3(), new cc.Vec3()],
                screenCorners: [new cc.Vec3(), new cc.Vec3(), new cc.Vec3(), new cc.Vec3()]
            };
            scheduleSelectedOutlineUpdate();
        }

        /** 更新拾取模式的游戏画布光标状态。 */
        function setPickingVisualState(enabled) {
            document.body.classList.toggle('cocos-runtime-node-picking', enabled);
        }

        /**
         * 更新快照中的节点自身激活状态，并重新计算整棵子树的层级激活状态。
         * 此方法仅更新当前面板快照，不访问引擎对象。
         */
        function syncSnapshotActiveState(item, active) {
            item.active = active;
            const stack = [item.id];
            let activeNodeCountDelta = 0;
            while (stack.length > 0) {
                const current = nodeTreeSnapshot.nodesById.get(stack.pop());
                const parent = nodeTreeSnapshot.nodesById.get(current.parentId);
                const previousActiveInHierarchy = current.activeInHierarchy;
                current.activeInHierarchy = current.active && (parent?.activeInHierarchy ?? true);
                if (previousActiveInHierarchy !== current.activeInHierarchy) {
                    activeNodeCountDelta += current.activeInHierarchy ? 1 : -1;
                }
                for (let i = 0; i < current.components.length; i++) {
                    const component = current.components[i];
                    component.enabledInHierarchy = component.enabled && current.activeInHierarchy;
                }
                for (let i = current.childIds.length - 1; i >= 0; i--) stack.push(current.childIds[i]);
            }
            nodeTreeSnapshot.activeNodeCount += activeNodeCountDelta;
        }

        /** 修改当前 Web 预览中的节点显隐，不经过只读桥接接口。 */
        async function setRuntimeNodeActive(item, active) {
            if (!globalThis.System?.import) throw new Error('Cocos SystemJS runtime is not ready');
            const cc = await globalThis.System.import('cc');
            const node = item.nodeReference.deref();
            if (!node || !cc.isValid(node)) throw new Error('节点已失效，请刷新节点树');
            node.active = active;
            syncSnapshotActiveState(item, active);
        }

        /** 将编辑器数值压缩为便于阅读和再次编辑的字符串。 */
        function formatEditableNumber(value) {
            if (!Number.isFinite(value)) return '0';
            return String(Number(value.toFixed(6)));
        }

        /** 获取有效的运行时对象并执行一次用户触发的修改。 */
        async function mutateRuntimeObject(reference, invalidMessage, mutation) {
            if (!globalThis.System?.import) throw new Error('Cocos SystemJS runtime is not ready');
            const cc = await globalThis.System.import('cc');
            const target = reference?.deref();
            if (!target || !cc.isValid(target)) throw new Error(invalidMessage);
            mutation(target, cc);
        }

        /** 创建数值输入框；仅在提交变更时调用引擎 setter。 */
        function createNumberField(axis, value, onCommit) {
            const field = createElement('label', 'rnt-number-field');
            field.appendChild(createElement('span', 'rnt-axis', axis));
            const input = createElement('input', 'rnt-number-input');
            input.type = 'number';
            input.step = 'any';
            input.value = formatEditableNumber(value);
            let acceptedValue = value;
            input.addEventListener('keydown', event => {
                event.stopPropagation();
                if (event.key === 'Enter') input.blur();
                if (event.key === 'Escape') {
                    input.value = formatEditableNumber(acceptedValue);
                    input.blur();
                }
            });
            input.addEventListener('change', async () => {
                const nextValue = Number(input.value);
                if (!Number.isFinite(nextValue)) {
                    input.value = formatEditableNumber(acceptedValue);
                    return;
                }
                input.disabled = true;
                try {
                    await onCommit(nextValue);
                    acceptedValue = nextValue;
                    input.value = formatEditableNumber(nextValue);
                } catch (error) {
                    input.value = formatEditableNumber(acceptedValue);
                    summary.textContent = `属性修改失败：${error instanceof Error ? error.message : String(error)}`;
                } finally {
                    input.disabled = false;
                }
            });
            field.appendChild(input);
            return field;
        }

        /** 向属性分组添加一行多轴数值编辑器。 */
        function appendVectorEditor(section, label, fields) {
            const row = createElement('div', 'rnt-editor-row');
            row.appendChild(createElement('span', 'rnt-editor-label', label));
            const controls = createElement('div', 'rnt-editor-fields');
            for (let i = 0; i < fields.length; i++) {
                controls.appendChild(createNumberField(fields[i].axis, fields[i].value, fields[i].onCommit));
            }
            row.appendChild(controls);
            section.appendChild(row);
        }

        /** 向属性分组添加一行枚举下拉框。 */
        function appendSelectEditor(section, label, currentValue, options, onCommit) {
            const row = createElement('div', 'rnt-editor-row');
            row.appendChild(createElement('span', 'rnt-editor-label', label));
            const select = createElement('select', 'rnt-select');
            let hasCurrentValue = false;
            for (let i = 0; i < options.length; i++) {
                const option = createElement('option', '', options[i].name);
                option.value = String(options[i].value);
                option.selected = options[i].value === currentValue;
                if (option.selected) hasCurrentValue = true;
                select.appendChild(option);
            }
            if (!hasCurrentValue) {
                const option = createElement('option', '', `Unknown (${currentValue})`);
                option.value = String(currentValue);
                option.selected = true;
                select.appendChild(option);
            }
            let acceptedValue = currentValue;
            select.addEventListener('change', async () => {
                const nextValue = Number(select.value);
                select.disabled = true;
                try {
                    await onCommit(nextValue);
                    acceptedValue = nextValue;
                } catch (error) {
                    select.value = String(acceptedValue);
                    summary.textContent = `属性修改失败：${error instanceof Error ? error.message : String(error)}`;
                } finally {
                    select.disabled = false;
                }
            });
            row.appendChild(select);
            section.appendChild(row);
        }

        /** 创建 Node 的运行时 Transform 和 Layer 编辑区。 */
        function appendNodeEditor(container, item, node) {
            const section = createElement('div', 'rnt-editor-section rnt-node-editor');
            section.appendChild(createElement('div', 'rnt-editor-title', 'Node'));
            const position = node.position;
            const rotation = node.eulerAngles;
            const scale = node.scale;

            appendVectorEditor(section, 'Position', [
                { axis: 'X', value: position.x, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setPosition(value, target.position.y, target.position.z)) },
                { axis: 'Y', value: position.y, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setPosition(target.position.x, value, target.position.z)) },
                { axis: 'Z', value: position.z, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setPosition(target.position.x, target.position.y, value)) }
            ]);
            appendVectorEditor(section, 'Rotation', [
                { axis: 'X', value: rotation.x, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setRotationFromEuler(value, target.eulerAngles.y, target.eulerAngles.z)) },
                { axis: 'Y', value: rotation.y, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setRotationFromEuler(target.eulerAngles.x, value, target.eulerAngles.z)) },
                { axis: 'Z', value: rotation.z, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setRotationFromEuler(target.eulerAngles.x, target.eulerAngles.y, value)) }
            ]);
            appendVectorEditor(section, 'Scale', [
                { axis: 'X', value: scale.x, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setScale(value, target.scale.y, target.scale.z)) },
                { axis: 'Y', value: scale.y, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setScale(target.scale.x, value, target.scale.z)) },
                { axis: 'Z', value: scale.z, onCommit: value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => target.setScale(target.scale.x, target.scale.y, value)) }
            ]);
            appendSelectEditor(section, 'Layer', node.layer, nodeTreeSnapshot.layerOptions, value => mutateRuntimeObject(item.nodeReference, '节点已失效，请刷新节点树', target => {
                target.layer = value;
                item.layer = value;
            }));
            container.appendChild(section);
        }

        /** 向已有组件面板添加 cc.UITransform 的可编辑属性。 */
        function appendUITransformEditor(section, component) {
            const uiTransform = component.componentReference.deref();
            if (!uiTransform) return;
            const size = uiTransform.contentSize;
            const anchor = uiTransform.anchorPoint;
            appendVectorEditor(section, 'Content Size', [
                { axis: 'W', value: size.width, onCommit: value => mutateRuntimeObject(component.componentReference, 'UITransform 已失效，请刷新节点树', target => target.setContentSize(value, target.contentSize.height)) },
                { axis: 'H', value: size.height, onCommit: value => mutateRuntimeObject(component.componentReference, 'UITransform 已失效，请刷新节点树', target => target.setContentSize(target.contentSize.width, value)) }
            ]);
            appendVectorEditor(section, 'Anchor Point', [
                { axis: 'X', value: anchor.x, onCommit: value => mutateRuntimeObject(component.componentReference, 'UITransform 已失效，请刷新节点树', target => target.setAnchorPoint(value, target.anchorPoint.y)) },
                { axis: 'Y', value: anchor.y, onCommit: value => mutateRuntimeObject(component.componentReference, 'UITransform 已失效，请刷新节点树', target => target.setAnchorPoint(target.anchorPoint.x, value)) }
            ]);
        }

        /** 创建组件对象打印按钮；仅在用户点击时输出到 Web 预览控制台。 */
        function createComponentPrintButton(component) {
            const button = createElement('button', 'rnt-print-component', '⎙');
            button.type = 'button';
            button.title = '在控制台打印组件对象';
            button.setAttribute('aria-label', `打印 ${component.type} 组件对象`);
            button.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                const target = component.componentReference.deref();
                if (!target) {
                    summary.textContent = '组件已失效，请刷新节点树';
                    return;
                }
                globalThis.console.log(`[Runtime Node Tree] ${component.type}`, target);
            });
            return button;
        }

        /** 将节点路径写入系统剪贴板；剪贴板 API 不可用时回退到浏览器复制命令。 */
        async function copyNodePath(path) {
            try {
                await navigator.clipboard.writeText(path);
                return;
            } catch {
                const textarea = createElement('textarea');
                textarea.value = path;
                textarea.readOnly = true;
                textarea.style.position = 'fixed';
                textarea.style.left = '-10000px';
                document.body.appendChild(textarea);
                textarea.select();
                const copied = document.execCommand('copy');
                textarea.remove();
                if (!copied) throw new Error('浏览器拒绝了剪贴板写入');
            }
        }

        /** 创建节点名称行末尾的复制路径和打印对象按钮。 */
        function createNodeActionButtons(item) {
            const actions = createElement('div', 'rnt-node-actions');
            const copyButton = createElement('button', 'rnt-node-action', '⧉');
            copyButton.type = 'button';
            copyButton.title = '复制节点路径';
            copyButton.setAttribute('aria-label', `复制 ${item.name} 的节点路径`);
            copyButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                void copyNodePath(item.path).then(() => {
                    summary.textContent = `已复制节点路径：${item.path}`;
                }).catch(error => {
                    summary.textContent = `复制节点路径失败：${error instanceof Error ? error.message : String(error)}`;
                });
            });

            const printButton = createElement('button', 'rnt-node-action', '⎙');
            printButton.type = 'button';
            printButton.title = '在控制台打印节点对象';
            printButton.setAttribute('aria-label', `打印 ${item.name} 节点对象`);
            printButton.addEventListener('click', event => {
                event.preventDefault();
                event.stopPropagation();
                const node = item.nodeReference.deref();
                if (!node) {
                    summary.textContent = '节点已失效，请刷新节点树';
                    return;
                }
                globalThis.console.log(`[Runtime Node Tree] ${item.path}`, node);
                summary.textContent = `已在控制台打印节点：${item.path}`;
            });

            actions.append(copyButton, printButton);
            return actions;
        }

        /** 在组件列表原位置创建默认折叠的组件属性面板。 */
        function appendComponentEditor(container, component) {
            const state = component.enabledInHierarchy ? '启用' : '禁用';
            const hasPropertyEditor = component.type === 'cc.UITransform';
            const section = createElement(
                hasPropertyEditor ? 'details' : 'div',
                `rnt-editor-section rnt-component-panel${hasPropertyEditor ? '' : ' rnt-component-static'}${component.enabledInHierarchy ? '' : ' is-disabled'}`
            );
            const title = createElement(hasPropertyEditor ? 'summary' : 'div', 'rnt-editor-title');
            title.title = `enabled: ${component.enabled}\nenabledInHierarchy: ${component.enabledInHierarchy}`;
            title.append(
                createElement('span', 'rnt-component-name', `${component.type} · ${state}`),
                createComponentPrintButton(component)
            );
            section.appendChild(title);
            if (hasPropertyEditor) {
                appendUITransformEditor(section, component);
            }
            container.appendChild(section);
        }

        /** 更新当前选中节点的只读详情。 */
        function renderDetails() {
            details.replaceChildren();
            void syncSelectedOutline().catch(error => {
                selectionOutline.classList.remove('is-visible');
                summary.textContent = `节点范围绘制失败：${error instanceof Error ? error.message : String(error)}`;
            });
            const item = nodeTreeSnapshot?.nodesById.get(selectedNodeId);
            if (!item) {
                details.appendChild(createElement('div', 'rnt-empty', '选择节点查看详情'));
                return;
            }

            const heading = createElement('div', 'rnt-details-heading');
            const visibilityCheckbox = createElement('input', 'rnt-details-visibility');
            visibilityCheckbox.type = 'checkbox';
            visibilityCheckbox.checked = item.active;
            visibilityCheckbox.disabled = item.parentId === 0;
            visibilityCheckbox.title = item.parentId === 0
                ? '场景根节点不可隐藏'
                : (item.active ? '隐藏节点' : '显示节点');
            visibilityCheckbox.addEventListener('change', async () => {
                visibilityCheckbox.disabled = true;
                try {
                    await setRuntimeNodeActive(item, visibilityCheckbox.checked);
                    summary.textContent = `${nodeTreeSnapshot.scene} · ${nodeTreeSnapshot.nodeCount} 节点 · ${nodeTreeSnapshot.activeNodeCount} 激活 · ${nodeTreeSnapshot.componentCount} 组件 · ${nodeTreeSnapshot.capturedAt.toLocaleTimeString()}`;
                    renderTree();
                    renderDetails();
                } catch (error) {
                    visibilityCheckbox.checked = item.active;
                    visibilityCheckbox.disabled = item.parentId === 0;
                    summary.textContent = `显隐切换失败：${error instanceof Error ? error.message : String(error)}`;
                }
            });
            heading.append(
                visibilityCheckbox,
                createElement('div', 'rnt-details-title', item.name),
                createNodeActionButtons(item)
            );
            details.appendChild(heading);
            const node = item.nodeReference.deref();
            if (node) appendNodeEditor(details, item, node);

            const componentTitle = createElement('div', 'rnt-details-title', `组件 (${item.components.length})`);
            componentTitle.style.marginTop = '9px';
            details.appendChild(componentTitle);
            if (item.components.length === 0) {
                details.appendChild(createElement('div', 'rnt-empty', '无组件'));
            } else {
                for (let i = 0; i < item.components.length; i++) {
                    appendComponentEditor(details, item.components[i]);
                }
            }
        }

        /** 根据展开状态和搜索条件渲染快照，不访问引擎节点。 */
        function renderTree() {
            tree.replaceChildren();
            if (!nodeTreeSnapshot) {
                tree.appendChild(createElement('div', 'rnt-empty', '尚未获取节点树'));
                return;
            }

            const query = search.value.trim().toLocaleLowerCase();
            const shouldRevealSelection = previousSearchQuery.length > 0 && query.length === 0;
            previousSearchQuery = query;
            if (shouldRevealSelection && selectedNodeId) {
                let current = nodeTreeSnapshot.nodesById.get(selectedNodeId);
                while (current?.parentId) {
                    current = nodeTreeSnapshot.nodesById.get(current.parentId);
                    if (current) expandedNodeIds.add(current.id);
                }
            }
            let allowedIds = null;
            if (query) {
                allowedIds = new Set();
                for (let i = 0; i < nodeTreeSnapshot.nodes.length; i++) {
                    const item = nodeTreeSnapshot.nodes[i];
                    const directText = `${item.name} ${item.components.map(component => component.type).join(' ')}`.toLocaleLowerCase();
                    const pathMatches = query.includes('/') && item.path.toLocaleLowerCase().includes(query);
                    if (directText.includes(query) || pathMatches) {
                        let current = item;
                        while (current) {
                            allowedIds.add(current.id);
                            current = nodeTreeSnapshot.nodesById.get(current.parentId);
                        }
                    }
                }
            }

            const fragment = document.createDocumentFragment();
            const stack = nodeTreeSnapshot.nodes.length > 0 ? [nodeTreeSnapshot.nodes[0].id] : [];
            let renderedRows = 0;
            while (stack.length > 0 && renderedRows < maxRenderedRows) {
                const id = stack.pop();
                const item = nodeTreeSnapshot.nodesById.get(id);
                if (!item || (allowedIds && !allowedIds.has(id))) continue;

                const row = createElement('div', `rnt-row${item.activeInHierarchy ? '' : ' is-inactive'}${item.id === selectedNodeId ? ' is-selected' : ''}`);
                row.style.paddingLeft = `${6 + item.depth * 14}px`;
                row.dataset.nodeId = String(item.id);
                const hasChildren = item.childIds.length > 0;
                const isExpanded = query ? true : expandedNodeIds.has(item.id);
                const toggle = hasChildren
                    ? createElement('button', 'rnt-toggle', isExpanded ? '▾' : '▸')
                    : createElement('span', 'rnt-toggle-placeholder');
                if (hasChildren) toggle.tabIndex = -1;
                const visibilityCheckbox = createElement('input', 'rnt-visibility');
                visibilityCheckbox.type = 'checkbox';
                visibilityCheckbox.checked = item.active;
                visibilityCheckbox.tabIndex = -1;
                visibilityCheckbox.disabled = item.parentId === 0;
                visibilityCheckbox.title = item.parentId === 0
                    ? '场景根节点不可隐藏'
                    : (item.active ? '隐藏节点' : '显示节点');
                const name = createElement('span', 'rnt-node-name', item.name);
                row.append(toggle, name);
                if (item.components.length > 0) row.appendChild(createElement('span', 'rnt-badge', String(item.components.length)));
                row.appendChild(visibilityCheckbox);

                if (hasChildren) {
                    toggle.addEventListener('click', event => {
                        event.stopPropagation();
                        if (expandedNodeIds.has(item.id)) expandedNodeIds.delete(item.id);
                        else expandedNodeIds.add(item.id);
                        renderTree();
                    });
                }
                visibilityCheckbox.addEventListener('click', event => {
                    event.stopPropagation();
                });
                visibilityCheckbox.addEventListener('change', async () => {
                    visibilityCheckbox.disabled = true;
                    try {
                        await setRuntimeNodeActive(item, visibilityCheckbox.checked);
                        summary.textContent = `${nodeTreeSnapshot.scene} · ${nodeTreeSnapshot.nodeCount} 节点 · ${nodeTreeSnapshot.activeNodeCount} 激活 · ${nodeTreeSnapshot.componentCount} 组件 · ${nodeTreeSnapshot.capturedAt.toLocaleTimeString()}`;
                        renderTree();
                        renderDetails();
                    } catch (error) {
                        visibilityCheckbox.checked = item.active;
                        summary.textContent = `显隐切换失败：${error instanceof Error ? error.message : String(error)}`;
                        visibilityCheckbox.disabled = false;
                    }
                });
                row.addEventListener('click', () => {
                    selectedNodeId = item.id;
                    renderTree();
                    renderDetails();
                });
                fragment.appendChild(row);
                renderedRows++;

                if (hasChildren && isExpanded) {
                    for (let i = item.childIds.length - 1; i >= 0; i--) stack.push(item.childIds[i]);
                }
            }

            tree.appendChild(fragment);
            if (renderedRows === 0) tree.appendChild(createElement('div', 'rnt-empty', '没有匹配的节点'));
            if (stack.length > 0) tree.appendChild(createElement('div', 'rnt-empty', `仅显示前 ${maxRenderedRows} 行，请缩小搜索范围`));
            if (shouldRevealSelection) {
                tree.querySelector(`[data-node-id="${selectedNodeId}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
            }
        }

        /** 重新读取当前场景并更新节点树快照。 */
        async function refreshTree() {
            refreshButton.disabled = true;
            summary.textContent = '正在读取运行时节点树…';
            resetAllNodePickingCycle();
            try {
                nodeTreeSnapshot = await captureNodeTree();
                expandedNodeIds.clear();
                if (nodeTreeSnapshot.nodes.length > 0) expandedNodeIds.add(nodeTreeSnapshot.nodes[0].id);
                selectedNodeId = nodeTreeSnapshot.nodes[0]?.id ?? 0;
                summary.textContent = `${nodeTreeSnapshot.scene} · ${nodeTreeSnapshot.nodeCount} 节点 · ${nodeTreeSnapshot.activeNodeCount} 激活 · ${nodeTreeSnapshot.componentCount} 组件 · ${nodeTreeSnapshot.capturedAt.toLocaleTimeString()}`;
                renderTree();
                renderDetails();
            } catch (error) {
                nodeTreeSnapshot = null;
                selectedNodeId = 0;
                summary.textContent = `读取失败：${error instanceof Error ? error.message : String(error)}`;
                renderTree();
                renderDetails();
            } finally {
                refreshButton.disabled = false;
            }
        }

        /** 打开或关闭面板；首次打开时自动获取一次快照。 */
        function setPanelOpen(open) {
            if (!open) {
                resetAllNodePickingCycle();
                setPickingMenuOpen(false);
                selectedOutlineGeneration++;
                clearSelectedOutlineBinding();
                selectionOutline.removeAttribute('style');
                selectionOutlineLabel.textContent = '';
                selectedNodeId = 0;
            }
            panel.classList.toggle('is-open', open);
            document.body.classList.toggle('cocos-runtime-node-tree-open', open);
            if (!open) {
                renderTree();
                renderDetails();
            }
            edgeToggle.textContent = open ? '收起' : '节点树';
            edgeToggle.title = open ? '收起运行时节点树（Ctrl + `）' : '打开运行时节点树（Ctrl + `）';
            setPickingVisualState(open && getPickingMode() !== 'off');
            void setPreviewSelectionEnabled(open && getPickingMode() !== 'off').catch(error => {
                summary.textContent = `点击定位监听失败：${error instanceof Error ? error.message : String(error)}`;
            });
            if (open) {
                void syncSelectedOutline().catch(error => {
                    selectionOutline.classList.remove('is-visible');
                    summary.textContent = `节点范围绘制失败：${error instanceof Error ? error.message : String(error)}`;
                });
            }
            if (open && !nodeTreeSnapshot) void refreshTree();
        }

        refreshButton.addEventListener('click', () => { void refreshTree(); });
        collapseButton.addEventListener('click', () => {
            search.value = '';
            previousSearchQuery = '';
            expandedNodeIds.clear();
            renderTree();
        });
        closeButton.addEventListener('click', () => { setPanelOpen(false); });
        edgeToggle.addEventListener('click', () => { setPanelOpen(!panel.classList.contains('is-open')); });
        pickingModeSelect.addEventListener('change', () => {
            syncPickingModeControl();
            resetAllNodePickingCycle();
            setPickingVisualState(isPickingEnabled());
            void setPreviewSelectionEnabled(isPickingEnabled()).catch(error => {
                pickingModeSelect.value = 'off';
                syncPickingModeControl();
                setPickingVisualState(false);
                clearSelectedOutlineBinding();
                summary.textContent = `点击定位监听失败：${error instanceof Error ? error.message : String(error)}`;
            });
            void syncSelectedOutline().catch(error => {
                selectionOutline.classList.remove('is-visible');
                summary.textContent = `节点范围绘制失败：${error instanceof Error ? error.message : String(error)}`;
            });
        });
        search.addEventListener('input', renderTree);
        document.addEventListener('pointerdown', event => {
            if (!pickingModeWrap.contains(event.target)) setPickingMenuOpen(false);
        });
        document.addEventListener('keydown', event => {
            if (event.key === 'Escape' && pickingModeWrap.classList.contains('is-open')) {
                event.preventDefault();
                event.stopPropagation();
                setPickingMenuOpen(false);
                pickingModeCurrent.focus();
                return;
            }
            if (event.ctrlKey && event.code === 'Backquote') {
                event.preventDefault();
                event.stopPropagation();
                setPanelOpen(!panel.classList.contains('is-open'));
            }
        }, true);
    }

    /** 将 Blob 编码成不带 Data URL 前缀的 Base64 文本。 */
    function blobToBase64(blob) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onerror = () => reject(reader.error ?? new Error('failed to read runtime screenshot PNG'));
            reader.onload = () => {
                const result = String(reader.result || '');
                const separator = result.indexOf(',');
                if (separator < 0) reject(new Error('runtime screenshot PNG encoding failed'));
                else resolve(result.slice(separator + 1));
            };
            reader.readAsDataURL(blob);
        });
    }

    /** 在当前帧绘制完成后捕捉 GameCanvas，不包含节点树等 DOM 调试界面。 */
    async function captureRuntimeScreenshot() {
        if (!globalThis.System?.import) throw new Error('Cocos SystemJS runtime is not ready');
        const cc = await globalThis.System.import('cc');
        const canvas = document.getElementById('GameCanvas');
        if (!(canvas instanceof HTMLCanvasElement) || canvas.width <= 0 || canvas.height <= 0) {
            throw new Error('GameCanvas is unavailable or has no drawable size');
        }

        const blob = await new Promise((resolve, reject) => {
            let started = false;
            let fallbackTimer = 0;
            const cleanup = () => {
                cc.director.off(cc.Director.EVENT_AFTER_DRAW, capture);
                if (fallbackTimer) clearTimeout(fallbackTimer);
            };
            const capture = () => {
                if (started) return;
                started = true;
                cleanup();
                try {
                    canvas.toBlob(result => {
                        if (result) resolve(result);
                        else reject(new Error('GameCanvas returned an empty PNG'));
                    }, 'image/png');
                } catch (error) {
                    reject(error);
                }
            };
            cc.director.once(cc.Director.EVENT_AFTER_DRAW, capture);
            fallbackTimer = window.setTimeout(capture, 1000);
        });

        return {
            instanceId,
            capturedAt: new Date().toISOString(),
            page: {
                title: document.title,
                url: location.href,
                visibility: document.visibilityState
            },
            width: canvas.width,
            height: canvas.height,
            pngBase64: await blobToBase64(blob)
        };
    }

    /** 将本次运行时请求结果或错误返回给本机 Creator 扩展。 */
    async function reply(requestId, type, options) {
        let payload;
        try {
            if (type === 'node-stats') payload = await captureNodeStats(options);
            else if (type === 'runtime-screenshot') payload = await captureRuntimeScreenshot();
            else throw new Error(`unsupported runtime request type: ${type}`);
        } catch (error) {
            payload = {
                instanceId,
                capturedAt: new Date().toISOString(),
                page: { title: document.title, url: location.href, visibility: document.visibilityState },
                error: error instanceof Error ? error.message : String(error)
            };
        }
        await fetch(`${relayOrigin}/runtime/result?request=${encodeURIComponent(requestId)}&instance=${encodeURIComponent(instanceId)}`, {
            method: 'POST',
            headers: { 'content-type': 'text/plain;charset=UTF-8' },
            body: JSON.stringify(payload)
        });
    }

    const events = new EventSource(`${relayOrigin}/runtime/events?instance=${encodeURIComponent(instanceId)}`);
    events.onmessage = event => {
        try {
            const request = JSON.parse(event.data);
            if ((request?.type === 'node-stats' || request?.type === 'runtime-screenshot') && request.requestId) {
                void reply(request.requestId, request.type, request.options);
            }
        } catch {
            // Ignore malformed local relay messages; EventSource reconnect remains active.
        }
    };

    installNodeTreePanel();

    globalThis.__cocosCodexRuntimeInspector = Object.freeze({
        instanceId,
        relayOrigin,
        captureNodeStats,
        captureNodeTree,
        captureRuntimeScreenshot
    });
})();
