import { app } from '../../scripts/app.js';
import { api } from '../../scripts/api.js';

const SWITCH = 'CSWITCH_ANY_IF_EMPTY';
const PROBE = 'CSWITCH_ANY_IF_EMPTY_PROBE';
const OWNED_MODE = 'crystools_empty_bypass_original_mode';
const outputClasses = new Set();

function graphNodes(graph, prefix = '') {
    const result = [];
    for (const node of graph.nodes ?? graph._nodes ?? []) {
        const id = `${prefix}${node.id}`;
        result.push({ node, id });
        if (node.subgraph) result.push(...graphNodes(node.subgraph, `${id}:`));
    }
    return result;
}

function ancestorPrompt(output, ids, replaceSwitches = true) {
    const result = {};
    function visit(id) {
        if (result[id]) return;
        const entry = output[id];
        if (!entry) throw new Error(`Crystools bypass: missing upstream node ${id}`);
        // Only class_type changes. Inputs may contain frontend reactive proxies.
        result[id] = { ...entry };
        for (const value of Object.values(entry.inputs)) {
            if (Array.isArray(value) && value.length === 2 &&
                typeof value[0] === 'string' && Number.isInteger(value[1]) && output[value[0]]) {
                visit(value[0]);
            }
        }
    }
    ids.forEach(visit);
    if (replaceSwitches) {
        for (const id of ids) result[id].class_type = PROBE;
    }
    return result;
}

function orderedControls(output, controls) {
    const remaining = new Set(controls.map(({ id }) => id));
    const ordered = [];
    function visit(control) {
        if (!remaining.delete(control.id)) return;
        const ancestors = ancestorPrompt(output, [control.id], false);
        for (const candidate of controls) {
            if (candidate.id !== control.id && ancestors[candidate.id]) visit(candidate);
        }
        ordered.push(control);
    }
    controls.forEach(visit);
    return ordered;
}

function slotSignature(node) {
    return JSON.stringify((node.inputs ?? []).map((input, index) => {
        const link = node.getInputLink?.(index);
        return [input.name, input.type, input.link ?? input.linkId,
            link?.origin_id, link?.origin_slot];
    }));
}

function bypassPrompt(baseline, bypassed, routing) {
    const prompt = JSON.parse(JSON.stringify(baseline));
    function resolve(value, type, visited = new Set()) {
        if (!Array.isArray(value) || value.length !== 2 || !bypassed.has(String(value[0]))) return value;
        const [id, slot] = value;
        const key = `${id}:${slot}`;
        if (visited.has(key)) throw new Error('Crystools bypass: circular bypass connection');
        visited.add(key);
        const node = routing.get(String(id));
        const inputs = node.inputs;
        const outputType = node.outputs[slot];
        const valid = (input) => LiteGraph.isValidConnection(input.type, outputType) &&
            LiteGraph.isValidConnection(input.type, type);
        // Match ComfyUI's native bypass slot selection, including wildcard receivers.
        let index;
        if (type === '*' || type === '') index = inputs.length > slot ? slot : 0;
        else if (inputs[slot] && valid(inputs[slot])) index = slot;
        else {
            index = inputs.findIndex(input => input.type === type);
            if (index === -1) index = inputs.findIndex(valid);
        }
        const input = inputs[index];
        if (!input?.connected) return undefined;
        return resolve(baseline.output[id]?.inputs[input.name], input.type, visited);
    }
    for (const [id, entry] of Object.entries(prompt.output)) {
        if (bypassed.has(id)) {
            delete prompt.output[id];
            continue;
        }
        for (const [name, value] of Object.entries(entry.inputs)) {
            const type = routing.get(id)?.inputs.find(input => input.name === name)?.type;
            const resolved = resolve(value, type);
            if (resolved === undefined) delete entry.inputs[name];
            else entry.inputs[name] = resolved;
        }
    }
    // Keep history's workflow modes consistent with the submitted prompt.
    const definitions = prompt.workflow.definitions?.subgraphs ?? [];
    function mark(workflow, prefix = '') {
        for (const node of workflow.nodes ?? []) {
            const id = `${prefix}${node.id}`;
            if (bypassed.has(id)) {
                node.properties ??= {};
                node.properties[OWNED_MODE] = node.mode;
                node.mode = 4;
            }
            const inner = definitions.find(definition => definition.id === node.type);
            if (inner) mark(inner, `${id}:`);
        }
    }
    mark(prompt.workflow);
    return prompt;
}

async function completedProbe(promptId) {
    if (!promptId) throw new Error('Crystools bypass: preflight was not accepted');
    let absentCount = 0;
    for (;;) {
        const response = await api.fetchApi(`/history/${encodeURIComponent(promptId)}`);
        if (!response.ok) throw new Error('Crystools bypass: could not read preflight result');
        const history = (await response.json())[promptId];
        if (history) {
            if (history.status?.status_str !== 'success') {
                throw new Error('Crystools bypass preflight failed or was interrupted; main workflow was not queued');
            }
            return history.outputs;
        }
        const queueResponse = await api.fetchApi('/queue');
        if (!queueResponse.ok) throw new Error('Crystools bypass: could not read queue');
        const queue = await queueResponse.json();
        const present = [...(queue.queue_running ?? []), ...(queue.queue_pending ?? [])]
            .some(entry => entry[1] === promptId);
        absentCount = present ? 0 : absentCount + 1;
        if (absentCount >= 3) throw new Error('Crystools bypass preflight was removed from the queue');
        await new Promise(resolve => setTimeout(resolve, 400));
    }
}

app.registerExtension({
    name: 'Crystools.SwitchAnyIfEmpty.NativeBypass',
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (nodeData.output_node) outputClasses.add(nodeData.name);
    },
    setup() {
        const originalQueue = api.queuePrompt;
        api.queuePrompt = async function (number, data, options, ...rest) {
            const graph = app.rootGraph ?? app.graph;
            const entries = graphNodes(graph);
            const owned = entries.filter(({ node }) => node.properties?.[OWNED_MODE] !== undefined);
            const isControl = ({ node }) => node.comfyClass === SWITCH &&
                node.widgets?.find(widget => widget.name === 'empty_action')?.value === 'bypass';
            if (!entries.some(isControl) && !owned.length) {
                return originalQueue.call(this, number, data, options, ...rest);
            }
            const snapshot = new Map(owned.map(({ node }) => [node, {
                mode: node.mode, original: node.properties[OWNED_MODE],
            }]));
            try {
                // Restore only modes owned by this extension before checking again.
                for (const { node } of owned) {
                    if (node.mode === 4) node.mode = node.properties[OWNED_MODE];
                    delete node.properties[OWNED_MODE];
                }
                // Detach transport data before any preflight can execute or update widgets.
                const baseline = JSON.parse(JSON.stringify(owned.length
                    ? await app.graphToPrompt(graph) : data));
                // Subgraph hosts are not executable nodes; their getInputLink resolves outputs.
                const routing = new Map(entries.filter(({ id }) => baseline.output[id]).map(({ node, id }) => [id, {
                    node, mode: node.mode, type: node.comfyClass, signature: slotSignature(node),
                    inputs: (node.inputs ?? []).map((input, index) => ({
                        name: input.name, type: input.type,
                        connected: (node.getInputLink?.(index) ?? input.link ?? input.linkId) != null,
                    })),
                    outputs: (node.outputs ?? []).map(output => output.type),
                }]));
                const requested = options?.partialExecutionTargets?.map(String);
                const roots = requested?.length ? requested :
                    Object.keys(baseline.output).filter(id =>
                        outputClasses.has(baseline.output[id].class_type));
                const reachable = ancestorPrompt(baseline.output,
                    roots.filter(id => baseline.output[id]), false);
                const active = entries.filter(entry => isControl(entry) &&
                    entry.node.mode !== 2 && entry.node.mode !== 4 && reachable[entry.id]);
                const bypassed = new Set();
                let prompt = baseline;
                for (const { id } of orderedControls(baseline.output, active)) {
                    const stageReachable = ancestorPrompt(prompt.output,
                        roots.filter(root => prompt.output[root]), false);
                    if (!stageReachable[id]) continue;
                    const preflight = { workflow: prompt.workflow,
                        output: ancestorPrompt(prompt.output, [id]) };
                    // Check on the user's configured device, only as part of their Run.
                    const queued = await originalQueue.call(this, number, preflight,
                        { ...options, partialExecutionTargets: [id] }, ...rest);
                    const results = await completedProbe(queued.prompt_id);
                    const states = results[id]?.crystools_empty_branch;
                    if (!Array.isArray(states) || !states.length ||
                        !states.every(state => typeof state === 'boolean' && state === states[0])) {
                        throw new Error(`Crystools bypass: node ${id} has no single empty-branch result`);
                    }
                    if (!states[0]) continue;
                    // The captured API links already resolve reroutes and subgraph boundaries.
                    for (const [targetId, target] of Object.entries(prompt.output)) {
                        if (!Object.values(target.inputs).some(value => Array.isArray(value) &&
                            value.length === 2 && String(value[0]) === id && value[1] === 0)) continue;
                        const receiver = routing.get(targetId);
                        if (!receiver || receiver.mode === 2 || receiver.mode === 4) continue;
                        if (entries.filter(entry => entry.node === receiver.node).length > 1) {
                            throw new Error(`Crystools bypass: receiver ${receiver.node.id} is inside a shared subgraph; ` +
                                'its native mode affects every instance. Use a separate subgraph definition for this receiver.');
                        }
                        bypassed.add(targetId);
                    }
                    prompt = bypassPrompt(baseline, bypassed, routing);
                }
                const targets = requested?.length
                    ? requested.filter(id => prompt.output[id])
                    : Object.keys(prompt.output).filter(id =>
                        outputClasses.has(prompt.output[id].class_type));
                const finalOptions = requested?.length
                    ? { ...options, partialExecutionTargets: targets } : options;
                // Bypassing the last output is valid and needs no main job.
                const result = !targets.length && bypassed.size ? { node_errors: {} }
                    : await originalQueue.call(this, number, prompt, finalOptions, ...rest);
                // Mirror completed decisions only onto unchanged receivers in the original canvas.
                if ((app.rootGraph ?? app.graph) === graph) {
                    const current = graphNodes(graph);
                    for (const id of bypassed) {
                        const saved = routing.get(id);
                        const node = saved.node;
                        if (!current.some(entry => entry.id === id && entry.node === node) ||
                            node.mode !== saved.mode || node.comfyClass !== saved.type ||
                            slotSignature(node) !== saved.signature) continue;
                        node.properties ??= {};
                        node.properties[OWNED_MODE] = node.mode;
                        node.mode = 4;
                    }
                    graph.setDirtyCanvas?.(true, true);
                }
                return result;
            } catch (error) {
                for (const [node, previous] of snapshot) {
                    if (node.mode !== previous.original || node.properties?.[OWNED_MODE] !== undefined) continue;
                    node.mode = previous.mode;
                    node.properties[OWNED_MODE] = previous.original;
                }
                graph.setDirtyCanvas?.(true, true);
                throw error;
            }
        };
    },
});
