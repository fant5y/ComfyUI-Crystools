import { app } from './comfy/index.js';
const PIPE_TO = 'Pipe to/edit any [Crystools]';
const PIPE_FROM = 'Pipe from any [Crystools]';
const CAPACITY = 100;
const FIRST_AVAILABLE = 'First available any [Crystools]';
const isPipe = (node) => node.type === PIPE_TO || node.type === PIPE_FROM;
const pendingGraphs = new WeakSet();
const graphsOf = (graph) => {
    const root = graph.rootGraph || graph;
    return [root, ...Array.from(root.subgraphs?.values() || [])];
};
const uniqueHost = (graph) => {
    const hosts = graphsOf(graph).flatMap(owner => owner._nodes.filter(node => node.subgraph === graph));
    return hosts.length === 1 ? hosts[0] : undefined;
};
const resolveSource = (graph, link, context, visited, inputPath = new Set()) => {
    if (!link) {
        return undefined;
    }
    if (graph.inputNode?.id === link.origin_id) {
        if (inputPath.has(graph)) {
            return undefined;
        }
        const host = context.get(graph) || uniqueHost(graph);
        const externalLinkId = host?.inputs[link.origin_slot]?.link;
        if (!host?.graph || (typeof externalLinkId !== 'number' && typeof externalLinkId !== 'string')) {
            return undefined;
        }
        return resolveSource(host.graph, host.graph.links.get(externalLinkId), context, visited, new Set(inputPath).add(graph));
    }
    const node = graph.getNodeById(link.origin_id);
    if (!node || visited.has(node)) {
        return undefined;
    }
    if (node.subgraph) {
        const innerLink = node.subgraph.outputNode?.slots[link.origin_slot]?.getLinks()[0];
        return resolveSource(node.subgraph, innerLink, new Map(context).set(node.subgraph, node), new Set(visited).add(node));
    }
    if (node.type === 'Reroute') {
        return resolveSource(graph, node.getInputLink(0), context, new Set(visited).add(node));
    }
    return { node, index: link.origin_slot, context, visited };
};
const describeOutput = (source) => {
    const { node, index, visited, context } = source;
    if (node.type === PIPE_FROM && index > 0) {
        return describePipe(node, visited, context)[index - 1];
    }
    const slot = node.outputs[index];
    if (!slot) {
        return undefined;
    }
    const canvas = app.canvas;
    return {
        label: slot.label || slot.name || String(slot.type),
        type: slot.type,
        color_on: slot.color_on || canvas.default_connection_color_byType[slot.type],
        color_off: slot.color_off || canvas.default_connection_color_byTypeOff[slot.type],
    };
};
const describePipe = (node, visited = new Set(), context = new Map()) => {
    if (!node.graph || visited.has(node)) {
        return [];
    }
    const path = new Set(visited).add(node);
    const parent = resolveSource(node.graph, node.getInputLink(0), context, path);
    const values = parent && isPipe(parent.node) ? describePipe(parent.node, parent.visited, parent.context) : [];
    if (node.type === PIPE_TO) {
        node.inputs.slice(1).forEach((_slot, index) => {
            const source = resolveSource(node.graph, node.getInputLink(index + 1), context, path);
            if (source) {
                values[index] = describeOutput(source);
            }
        });
    }
    return values;
};
const decorateSlot = (slot, value, output) => {
    slot.label = value?.label || slot.name;
    slot.type = output ? value?.type || '*' : '*';
    slot.color_on = value?.color_on;
    slot.color_off = value?.color_off;
};
const connectedRange = (slots, input) => {
    let count = 0;
    slots.slice(1).forEach((slot, index) => {
        if (input ? slot.link !== null && slot.link !== undefined : slot.links?.length) {
            count = index + 1;
        }
    });
    return count;
};
const refreshNode = (node) => {
    const values = describePipe(node);
    const input = node.type === PIPE_TO;
    const slots = input ? node.inputs : node.outputs;
    const connectedCount = connectedRange(slots, input);
    const count = Math.min(CAPACITY, Math.max(6, values.length + (input ? 1 : 0), connectedCount + (input ? 1 : 0)));
    const oldLength = slots.length;
    while (slots.length > count + 1) {
        if (input) {
            node.removeInput(slots.length - 1);
        }
        else {
            node.removeOutput(slots.length - 1);
        }
    }
    while (slots.length < count + 1) {
        if (input) {
            node.addInput(`any_${slots.length}`, '*');
        }
        else {
            node.addOutput(`any_${slots.length}`, '*');
        }
    }
    slots.slice(1).forEach((slot, index) => {
        decorateSlot(slot, values[index], !input);
        if (!input) {
            slot.links?.forEach(id => {
                const link = node.graph?.links.get(id);
                if (link) {
                    link.type = slot.type;
                }
            });
        }
    });
    const size = node.computeSize();
    if (slots.length !== oldLength || size[0] > node.size[0]) {
        node.setSize([Math.max(node.size[0], size[0]), slots.length !== oldLength ? size[1] : node.size[1]]);
    }
};
const refreshSwitch = (node) => {
    let lastConnected = -1;
    node.inputs.forEach((slot, index) => {
        if (slot.link !== null && slot.link !== undefined) {
            lastConnected = index;
        }
    });
    const count = Math.min(CAPACITY, Math.max(2, lastConnected + 2));
    const oldLength = node.inputs.length;
    while (node.inputs.length > count) {
        node.removeInput(node.inputs.length - 1);
    }
    while (node.inputs.length < count) {
        node.addInput(`any_${node.inputs.length + 1}`, '*');
    }
    node.inputs.forEach((slot, index) => {
        const source = node.graph && resolveSource(node.graph, node.getInputLink(index), new Map(), new Set());
        decorateSlot(slot, source ? describeOutput(source) : undefined, false);
    });
    const size = node.computeSize();
    if (oldLength !== count || size[0] > node.size[0]) {
        node.setSize([Math.max(node.size[0], size[0]), oldLength !== count ? size[1] : node.size[1]]);
    }
};
const refresh = (node) => {
    if (node.type === FIRST_AVAILABLE) {
        refreshSwitch(node);
    }
    else {
        refreshNode(node);
    }
};
const scheduleRefresh = (graph) => {
    const root = graph?.rootGraph || graph;
    if (!root || pendingGraphs.has(root)) {
        return;
    }
    pendingGraphs.add(root);
    queueMicrotask(() => {
        try {
            for (const owner of graphsOf(root)) {
                observeGraph(owner);
                owner._nodes.filter(node => isPipe(node) || node.type === FIRST_AVAILABLE).forEach(refresh);
                owner.setDirtyCanvas(true, true);
            }
        }
        finally {
            pendingGraphs.delete(root);
        }
    });
};
const observedGraphs = new WeakSet();
const observedHosts = new WeakSet();
const observeGraph = (graph) => {
    if (!observedGraphs.has(graph)) {
        observedGraphs.add(graph);
        for (const event of [
            'configured', 'node:added', 'node:removed', 'subgraph-created', 'convert-to-subgraph',
            'node:slot-label:changed',
        ]) {
            graph.events?.addEventListener(event, () => scheduleRefresh(graph));
        }
    }
    for (const host of graph._nodes.filter(node => node.subgraph)) {
        if (observedHosts.has(host)) {
            continue;
        }
        observedHosts.add(host);
        const original = host.onConnectionsChange;
        host.onConnectionsChange = function (...args) {
            const result = original?.apply(this, args);
            scheduleRefresh(this.graph);
            return result;
        };
    }
};
app.registerExtension({
    name: 'Crystools.Pipes',
    setup() {
        observeGraph(app.rootGraph);
        scheduleRefresh(app.rootGraph);
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (![PIPE_TO, PIPE_FROM, FIRST_AVAILABLE].includes(nodeData.name)) {
            return;
        }
        const prototype = nodeType.prototype;
        const created = prototype.onNodeCreated;
        prototype.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);
            refresh(this);
            return result;
        };
        for (const hook of ['onConfigure', 'onAdded', 'onRemoved', 'onConnectionsChange']) {
            const original = prototype[hook];
            prototype[hook] = function (...args) {
                const graph = this.graph;
                const result = original?.apply(this, args);
                scheduleRefresh(this.graph || graph);
                return result;
            };
        }
    },
});
