import { app } from './comfy/index.js';
const PIPE_TO = 'Pipe to/edit any [Crystools]';
const PIPE_FROM = 'Pipe from any [Crystools]';
const CAPACITY = 100;
const isPipe = (node) => node.type === PIPE_TO || node.type === PIPE_FROM;
const pendingGraphs = new WeakSet();
const describeOutput = (node, index, visited) => {
    if (node.type === 'Reroute' && !visited.has(node)) {
        const link = node.graph && node.getInputLink(0);
        const source = link && node.graph?.getNodeById(link.origin_id);
        if (source && link) {
            return describeOutput(source, link.origin_slot, new Set(visited).add(node));
        }
    }
    if (node.type === PIPE_FROM && index > 0) {
        return describePipe(node, visited)[index - 1];
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
const describePipe = (node, visited = new Set()) => {
    if (!node.graph || visited.has(node)) {
        return [];
    }
    const path = new Set(visited).add(node);
    const link = node.getInputLink(0);
    const parent = link && node.graph?.getNodeById(link.origin_id);
    const values = parent && isPipe(parent) ? describePipe(parent, path) : [];
    if (node.type === PIPE_TO) {
        node.inputs.slice(1).forEach((_slot, index) => {
            const inputLink = node.getInputLink(index + 1);
            const source = inputLink && node.graph?.getNodeById(inputLink.origin_id);
            if (source && inputLink) {
                values[index] = describeOutput(source, inputLink.origin_slot, path);
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
const scheduleRefresh = (graph) => {
    if (!graph || pendingGraphs.has(graph)) {
        return;
    }
    pendingGraphs.add(graph);
    queueMicrotask(() => {
        try {
            graph._nodes.filter(isPipe).forEach(refreshNode);
            graph.setDirtyCanvas(true, true);
        }
        finally {
            pendingGraphs.delete(graph);
        }
    });
};
app.registerExtension({
    name: 'Crystools.Pipes',
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.name !== PIPE_TO && nodeData.name !== PIPE_FROM) {
            return;
        }
        const prototype = nodeType.prototype;
        const created = prototype.onNodeCreated;
        prototype.onNodeCreated = function (...args) {
            const result = created?.apply(this, args);
            refreshNode(this);
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
