import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';
import { pipeCacheContext } from './pipe.js';

const SWITCH = 'CSWITCH_ANY_IF_EMPTY';
const DECISION = 'CRYSTOOLS_EMPTY_BYPASS_DECISION';
const ROUTE = 'CRYSTOOLS_EMPTY_BYPASS_ROUTE';
const OWNED_MODE = 'crystools_empty_bypass_original_mode';
const GUARD = '__crystools_empty_bypass_guard';
const CACHE_CONTEXT = '_crystools_cache_context';
const CACHE_CLASSES = new Set(['CSWITCH_ANY_AUTO', 'Pipe to/edit any [Crystools]']);
const contexts = new WeakMap();
let capture;
let serializing = 0;

function graphNodes(graph) {
    return (graph.nodes ?? graph._nodes ?? []).flatMap(node =>
        [node, ...(node.subgraph ? graphNodes(node.subgraph) : [])]);
}

function slotSignature(node) {
    return JSON.stringify((node.inputs ?? []).map(input =>
        [input.name, input.type, input.link ?? input.linkId]));
}

function restoreModes(graph) {
    for (const node of graphNodes(graph)) {
        if (node.properties?.[OWNED_MODE] === undefined) continue;
        if (node.mode === 4) node.mode = node.properties[OWNED_MODE];
        delete node.properties[OWNED_MODE];
    }
}

function compileRoutes(data, dtos, graph) {
    const source = data.output;
    const controls = new Map();
    const subgraphs = new Map();
    const isBypassSwitch = id => source[id]?.class_type === SWITCH &&
        source[id].inputs.empty_action === 'bypass';

    // A subgraph box is virtual: only its contents appear in the execution prompt.
    // Follow the canvas wire to recover the box as the direct receiver.
    for (const [id, dto] of dtos ?? []) {
        const node = dto.node;
        if (!node?.subgraph || dto.mode === 2 || dto.mode === 4) continue;
        const prefix = id.slice(0, id.lastIndexOf(':') + 1);
        const switches = new Set();
        for (const input of dto.inputs) {
            const link = node.graph?.links.get(input.linkId);
            if (link?.origin_slot !== 0) continue;
            const switchId = `${prefix}${link.origin_id}`;
            if (isBypassSwitch(switchId)) switches.add(switchId);
        }
        if (switches.size) {
            subgraphs.set(id, dto);
            controls.set(id, [...switches]);
        }
    }

    const guards = new Map();
    for (const [id, entry] of Object.entries(source)) {
        const inherited = new Set();
        for (let end = id.indexOf(':'); end !== -1; end = id.indexOf(':', end + 1)) {
            const hostId = id.slice(0, end);
            if (subgraphs.has(hostId)) controls.get(hostId).forEach(switchId => inherited.add(switchId));
        }
        const switches = Object.values(entry.inputs).filter(value =>
            Array.isArray(value) && value.length === 2 && value[1] === 0 &&
            isBypassSwitch(value[0]) && !inherited.has(value[0])).map(value => value[0]);
        if (switches.length) controls.set(id, [...new Set(switches)]);
        switches.forEach(switchId => inherited.add(switchId));
        if (inherited.size) guards.set(id, [...inherited]);
    }
    if (!controls.size) return data;
    if (!dtos || [...controls.keys()].some(id => !dtos.get(id)?.resolveInput)) {
        throw new Error('Crystools bypass: ComfyUI did not provide native connection routing. Reload the frontend.');
    }

    const prompt = JSON.parse(JSON.stringify(data));
    const decisions = new Map();
    const receivers = new Map();
    function addNode(kind, parts, classType, inputs) {
        const base = `__crystools_${encodeURIComponent(JSON.stringify([kind, ...parts]))}`;
        let id = base;
        for (let suffix = 1; Object.hasOwn(prompt.output, id); suffix++) id = `${base}_${suffix}`;
        prompt.output[id] = { class_type: classType, inputs };
        return [id, 0];
    }
    for (const [id, switches] of controls) {
        for (const switchId of switches) {
            if (!decisions.has(switchId)) {
                decisions.set(switchId, addNode('decision', [switchId], DECISION,
                    { value: [switchId, 0] }));
            }
        }
        const node = dtos.get(id).node;
        receivers.set(id, { node, signature: slotSignature(node), mode: node.mode,
            decisions: switches.map(switchId => decisions.get(switchId)[0]) });
    }
    function route(switches, parts, normal, passthrough, block = false, guard = false) {
        const inputs = { block, guard, has_passthrough: passthrough !== undefined };
        if (normal !== undefined) inputs.normal = normal;
        if (passthrough !== undefined) inputs.passthrough = passthrough;
        switches.forEach((switchId, index) => {
            inputs[`condition_${index}`] = decisions.get(switchId);
        });
        return addNode('route', parts, ROUTE, inputs);
    }

    // Only the serializer's temporary DTOs change mode. Canvas nodes stay untouched.
    const modes = [...controls.keys()].map(id => {
        const dto = dtos.get(id);
        return [dto, Object.getOwnPropertyDescriptor(dto, 'mode'), dto.mode];
    });
    const outputMethods = [];
    let followedHosts;
    try {
        for (const [dto, , mode] of modes) {
            Object.defineProperty(dto, 'mode', { value: mode, writable: true, configurable: true });
        }
        for (const [id, dto] of subgraphs) {
            const resolveOutput = dto.resolveOutput;
            outputMethods.push([dto, Object.getOwnPropertyDescriptor(dto, 'resolveOutput')]);
            Object.defineProperty(dto, 'resolveOutput', { configurable: true, value(slot, ...args) {
                // Preserve the box boundary until both native routes are captured.
                if (followedHosts && !followedHosts.has(id) && this.mode !== 4) {
                    return { node: this, origin_id: id, origin_slot: slot };
                }
                return resolveOutput.call(this, slot, ...args);
            } });
        }
        function routedValue(value, resolve, parts, bypassed = [], hosts = new Set()) {
            if (bypassed.length || (subgraphs.size && resolve)) {
                let resolved;
                try {
                    followedHosts = hosts;
                    resolved = resolve();
                } finally {
                    followedHosts = undefined;
                }
                value = resolved?.widgetInfo
                    ? (Array.isArray(resolved.widgetInfo.value)
                        ? { __value__: resolved.widgetInfo.value } : resolved.widgetInfo.value)
                    : resolved ? [resolved.origin_id, resolved.origin_slot] : undefined;
            }
            if (!Array.isArray(value) || value.length !== 2 || !controls.has(value[0])) return value;
            const upstream = value[0];
            if (bypassed.includes(upstream)) throw new Error('Crystools bypass: circular connection');
            const dto = dtos.get(upstream);
            const previous = dto.mode;
            let normal = value;
            if (subgraphs.has(upstream)) {
                hosts = new Set(hosts).add(upstream);
                normal = routedValue(value, resolve, [...parts, 'normal', upstream], bypassed, hosts);
            }
            let passthrough;
            try {
                dto.mode = 4;
                passthrough = routedValue(value, resolve, parts, [...bypassed, upstream], hosts);
            } finally {
                dto.mode = previous;
            }
            return route(controls.get(upstream), ['output', ...parts, ...bypassed, upstream], normal, passthrough);
        }
        for (const [id, entry] of Object.entries(source)) {
            const switches = guards.get(id);
            for (const [name, value] of Object.entries(entry.inputs)) {
                if (!Array.isArray(value) || value.length !== 2 || !source[value[0]]) continue;
                const dto = dtos.get(id);
                const index = dto?.inputs.findIndex(input => input.name === name);
                const resolve = dto?.resolveInput && index >= 0 ? () => dto.resolveInput(index) : undefined;
                const normal = routedValue(value, resolve, [id, name]);
                // Guard all receiver dependencies, including output nodes that are execution roots.
                prompt.output[id].inputs[name] = switches
                    ? route(switches, ['input', id, name], normal, undefined, true) : normal;
            }
            if (switches) {
                if (Object.hasOwn(entry.inputs, GUARD)) {
                    throw new Error(`Crystools bypass: reserved input already exists on node ${id}`);
                }
                prompt.output[id].inputs[GUARD] = route(switches, ['guard', id], undefined, undefined, false, true);
            }
        }
        for (const [switchId, decision] of decisions) {
            const dto = dtos.get(switchId);
            prompt.output[decision[0]].inputs.value = routedValue([switchId, 0],
                () => dto.resolveOutput(0, '*', new Set()), ['decision', switchId]);
        }
    } finally {
        for (const [dto, descriptor] of outputMethods) {
            if (descriptor) Object.defineProperty(dto, 'resolveOutput', descriptor);
            else delete dto.resolveOutput;
        }
        for (const [dto, descriptor] of modes) {
            if (descriptor) Object.defineProperty(dto, 'mode', descriptor);
            else delete dto.mode;
        }
    }
    contexts.set(prompt, { graph, receivers,
        decisionIds: new Set([...decisions.values()].map(value => value[0])) });
    return prompt;
}

function showDecision(context, detail) {
    const state = detail.output?.crystools_empty_branch?.[0];
    if (typeof state !== 'boolean' || !context.decisionIds.has(detail.node)) return;
    context.states.set(detail.node, state);
    if (serializing || (app.rootGraph ?? app.graph) !== context.graph) return;
    const groups = new Map();
    for (const receiver of context.receivers.values()) {
        const group = groups.get(receiver.node) ?? [];
        group.push(receiver);
        groups.set(receiver.node, group);
    }
    for (const [node, receivers] of groups) {
        const states = receivers.map(receiver =>
            receiver.decisions.some(id => context.states.get(id) === true) ? true :
                receiver.decisions.every(id => context.states.has(id)) ? false : undefined);
        // A shared subgraph definition has one canvas mode for all its instances.
        if (states.some(state => state === undefined || state !== states[0])) continue;
        const saved = receivers[0];
        if (!node.graph || slotSignature(node) !== saved.signature ||
            (node.mode !== saved.mode && !(node.mode === 4 && node.properties?.[OWNED_MODE] === saved.mode))) continue;
        node.properties ??= {};
        if (states[0]) {
            node.properties[OWNED_MODE] = saved.mode;
            node.mode = 4;
        } else if (node.properties[OWNED_MODE] !== undefined) {
            node.mode = node.properties[OWNED_MODE];
            delete node.properties[OWNED_MODE];
        }
    }
    context.graph.setDirtyCanvas?.(true, true);
}

app.registerExtension({
    name: 'Crystools.SwitchAnyIfEmpty.NativeBypass',
    beforeRegisterNodeDef(nodeType, nodeData) {
        // Supplied during submission; it is not a user-facing socket or widget.
        if (CACHE_CLASSES.has(nodeData.name)) delete nodeData.input.optional?.[CACHE_CONTEXT];
        if (nodeData.name !== SWITCH) return;
        const originalCreated = nodeType.prototype.onNodeCreated;
        nodeType.prototype.onNodeCreated = function (...args) {
            const result = originalCreated?.apply(this, args);
            const widget = this.widgets?.find(widget => widget.name === 'empty_action');
            if (widget) {
                const serialize = widget.serializeValue;
                widget.serializeValue = function (dto, ...args) {
                    // ComfyUI supplies its native routing objects to widget serialization.
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
            restoreModes(graph);
            const previous = capture;
            const current = {};
            capture = current;
            serializing++;
            try {
                const data = await originalSerialize.call(this, graph, ...args);
                for (const [id, entry] of Object.entries(data.output)) {
                    if (CACHE_CLASSES.has(entry.class_type)) {
                        entry.inputs[CACHE_CONTEXT] = pipeCacheContext(graph, id);
                    }
                }
                return compileRoutes(data, current.dtos, graph);
            } finally {
                serializing--;
                capture = previous;
            }
        };

        const runs = new Map();
        const pending = new Set();
        api.addEventListener('executed', ({ detail }) => {
            const context = runs.get(detail.prompt_id);
            if (context) showDecision(context, detail);
            else for (const request of pending) {
                if (request.decisionIds.has(detail.node)) request.early.push(detail);
            }
        });
        const originalQueue = api.queuePrompt;
        api.queuePrompt = async function (number, data, ...args) {
            const saved = contexts.get(data);
            if (!saved) return originalQueue.call(this, number, data, ...args);
            const context = { ...saved, states: new Map(), early: [] };
            pending.add(context);
            try {
                const result = await originalQueue.call(this, number, data, ...args);
                if (result.prompt_id) {
                    runs.set(result.prompt_id, context);
                    for (const detail of context.early) {
                        if (detail.prompt_id === result.prompt_id) showDecision(context, detail);
                    }
                    context.early.length = 0;
                    if (runs.size > 64) runs.delete(runs.keys().next().value);
                }
                return result;
            } finally {
                pending.delete(context);
            }
        };
    },
});
