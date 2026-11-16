import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import { pipeCacheContext, preparePipeLayouts } from './pipe.js';

const SWITCH = 'CSWITCH_ANY_IF_EMPTY';
const OWNED_MODE = 'crystools_empty_bypass_original_mode';
const CACHE_CONTEXT = '_crystools_cache_context';
const CACHE_CLASSES = new Set(['CSWITCH_ANY_AUTO', 'Pipe to/edit any [Crystools]']);
const contexts = new WeakMap();
let capture;

function graphNodes(graph) {
    return (graph.nodes ?? graph._nodes ?? []).flatMap(node =>
        [node, ...(node.subgraph ? graphNodes(node.subgraph) : [])]);
}

function slotSignature(node) {
    // Extensions can refresh socket types without changing the actual wiring.
    return JSON.stringify((node.inputs ?? []).flatMap((input, index) => {
        const link = input.link ?? input.linkId;
        return link == null ? [] : [[index, link]];
    }));
}

function restoreModes(graph) {
    const snapshots = [];
    for (const node of graphNodes(graph)) {
        const mode = node.properties?.[OWNED_MODE];
        if (mode === undefined) continue;
        if (node.mode === 4) {
            snapshots.push({ node, mode, graph: node.graph, signature: slotSignature(node) });
            node.mode = mode;
        }
        delete node.properties[OWNED_MODE];
    }
    return snapshots;
}

function restoreCanvasBypass(snapshots) {
    for (const { node, mode, graph, signature } of snapshots) {
        if (node.graph !== graph || node.mode !== mode || slotSignature(node) !== signature) continue;
        node.properties[OWNED_MODE] = mode;
        node.mode = 4;
    }
}

function redrawGraph(graph) {
    graph.setDirtyCanvas?.(true, true);
    if ((app.rootGraph ?? app.graph) === graph) app.canvas?.setDirty?.(true, true);
}

const literalInputs = new Map([
    ['PrimitiveBoolean', 'value'],
    ['PrimitiveString', 'value'],
    ['PrimitiveInt', 'value'],
    ['PrimitiveFloat', 'value'],
    ['StringConstant', 'string'],
]);

function selectsMissingBranch(inputs, output) {
    if (inputs.on_true == null && inputs.on_false == null) return true;
    let value = inputs.value;
    if (Array.isArray(value)) {
        const [sourceId, slot] = value;
        const source = output[sourceId];
        const widgetName = literalInputs.get(source?.class_type);
        if (slot !== 0 || !widgetName) return false;
        value = source.inputs[widgetName];
        if (!['boolean', 'string', 'number'].includes(typeof value)) return false;
    }
    const empty = value == null || value === false ||
        (typeof value === 'string' && !value.trim()) ||
        (inputs.zero_is_empty === true && value === 0);
    return (empty ? inputs.on_true : inputs.on_false) == null;
}

const outputClasses = new Set();

function dependencies(output, roots) {
    const nodes = new Map();
    function visit(id) {
        const entry = output[id];
        if (!entry || nodes.has(id)) return;
        nodes.set(id, entry);
        for (const value of Object.values(entry.inputs)) {
            if (Array.isArray(value) && value.length === 2 && typeof value[0] === 'string') {
                visit(value[0]);
            }
        }
        // Visit dependencies before considering the switch itself.
        nodes.delete(id);
        nodes.set(id, entry);
    }
    roots.forEach(visit);
    return nodes;
}

function receiversFor(switchId, output, dtos) {
    const receivers = new Set();
    for (const [id, dto] of dtos ?? []) {
        const node = dto.node;
        if (!node?.graph || dto.mode === 2 || dto.mode === 4) continue;
        const prefix = id.slice(0, id.lastIndexOf(':') + 1);
        const direct = node.inputs?.some(input => {
            const link = node.graph.links.get(input.link ?? input.linkId);
            return link?.origin_slot === 0 && prefix + link.origin_id === switchId;
        });
        if (direct || Object.values(output[id]?.inputs ?? {}).some(value =>
            Array.isArray(value) && value[0] === switchId && value[1] === 0)) {
            receivers.add(id);
        }
    }
    // When the switch is wired to a box, the flattened prompt also exposes
    // connections to its children. Bypass the box as one unit.
    return [...receivers].filter(id => {
        for (let end = id.indexOf(':'); end !== -1; end = id.indexOf(':', end + 1)) {
            if (receivers.has(id.slice(0, end))) return false;
        }
        return true;
    });
}

app.registerExtension({
    name: 'Crystools.SwitchAnyIfEmpty.NativeBypass',
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.output_node) outputClasses.add(nodeData.name);
        if (CACHE_CLASSES.has(nodeData.name)) delete nodeData.input.optional?.[CACHE_CONTEXT];
        if (nodeData.name !== SWITCH) return;
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = originalCreated?.apply(this, args);
            const widget = this.widgets?.find(widget => widget.name === 'empty_action');
            if (widget) {
                const serialize = widget.serializeValue;
                widget.serializeValue = function (dto, ...args) {
                    if (capture && dto.nodesByExecutionId) capture.dtos = dto.nodesByExecutionId;
                    return serialize ? serialize.call(this, dto, ...args) : this.value;
                };
            }
            return result;
        };
    },
    setup() {
        const originalSerialize = app.graphToPrompt;
        app.graphToPrompt = async function (graph = app.rootGraph ?? app.graph, ...args) {
            const previous = capture;
            const current = {};
            capture = current;
            try {
                preparePipeLayouts(graph);
                const data = await originalSerialize.call(this, graph, ...args);
                for (const [id, entry] of Object.entries(data.output)) {
                    if (CACHE_CLASSES.has(entry.class_type)) {
                        entry.inputs[CACHE_CONTEXT] = pipeCacheContext(graph, id);
                    }
                }
                contexts.set(data, current.dtos);
                return data;
            } finally {
                capture = previous;
            }
        };

        const originalQueue = api.queuePrompt;
        api.queuePrompt = async function (number, data, options, ...rest) {
            const graph = app.rootGraph ?? app.graph;
            const previousModes = restoreModes(graph);
            let prompt = data;
            const applied = [];
            try {
                if (previousModes.length) prompt = await app.graphToPrompt(graph);
                const requested = options?.partialExecutionTargets?.map(String);
                const roots = requested?.length ? requested : Object.keys(prompt.output)
                    .filter(id => outputClasses.has(prompt.output[id].class_type));
                const switches = [...dependencies(prompt.output, roots)].filter(([, entry]) =>
                    entry.class_type === SWITCH && entry.inputs.empty_action === 'bypass');

                for (const [id] of switches) {
                    if (!dependencies(prompt.output, roots).has(id)) continue;
                    const dtos = contexts.get(prompt);
                    const receiverIds = receiversFor(id, prompt.output, dtos);
                    if (!receiverIds.length) continue;
                    if (!selectsMissingBranch(prompt.output[id].inputs, prompt.output)) continue;

                    const currentDtos = dtos;
                    const targets = new Set(receiverIds.map(targetId => currentDtos.get(targetId).node));
                    const targetIds = new Set(receiverIds);
                    for (const [targetId, dto] of currentDtos) {
                        if (targets.has(dto.node) && !targetIds.has(targetId)) {
                            throw new Error('Crystools bypass: the receiver is shared by multiple subgraph instances');
                        }
                    }
                    for (const node of targets) {
                        node.properties ??= {};
                        node.properties[OWNED_MODE] = node.mode;
                        applied.push(node);
                        node.mode = 4;
                    }
                    prompt = await app.graphToPrompt(graph);
                }

                if (previousModes.length || applied.length) redrawGraph(graph);
                if (!roots.some(id => prompt.output[id]) && applied.length) return { node_errors: {} };
                const finalOptions = requested?.length
                    ? { ...options, partialExecutionTargets: requested.filter(id => prompt.output[id]) }
                    : options;
                return await originalQueue.call(this, number, prompt, finalOptions, ...rest);
            } catch (error) {
                for (const node of applied) {
                    if (node.mode === 4) node.mode = node.properties[OWNED_MODE];
                    delete node.properties[OWNED_MODE];
                }
                restoreCanvasBypass(previousModes);
                redrawGraph(graph);
                throw error;
            }
        };
    },
});
