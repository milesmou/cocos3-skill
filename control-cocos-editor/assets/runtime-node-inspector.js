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

    /** 将本次快照或错误返回给本机 Creator 扩展。 */
    async function reply(requestId, options) {
        let payload;
        try {
            payload = await captureNodeStats(options);
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
            if (request?.type === 'node-stats' && request.requestId) {
                void reply(request.requestId, request.options);
            }
        } catch {
            // Ignore malformed local relay messages; EventSource reconnect remains active.
        }
    };

    globalThis.__cocosCodexRuntimeInspector = Object.freeze({
        instanceId,
        relayOrigin,
        captureNodeStats
    });
})();
