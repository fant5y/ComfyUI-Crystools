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

function decisionInputs(output, id) {
    const ancestors = output[id] ? ancestorPrompt(output, [id], false) : {};
    // Match JSON transport and detach reactive inputs before awaiting execution.
    const nodes = JSON.parse(JSON.stringify(Object.fromEntries(Object.entries(ancestors)
        .map(([key, node]) => [key, { class_type: node.class_type, inputs: node.inputs }]))));
    const stableJson = value => JSON.stringify(value, (_key, item) =>
        item && typeof item === 'object' && !Array.isArray(item)
            ? Object.fromEntries(Object.keys(item).sort().map(key => [key, item[key]])) : item);
    return new Map(Object.entries(nodes).map(([key, node]) => [key, {
        type: node.class_type,
        inputs: new Map(Object.entries(node.inputs).map(([name, value]) => [name, stableJson(value)])),
    }]));
}

function changedDecisionInputs(before, after) {
    const changes = [];
    for (const id of new Set([...before.keys(), ...after.keys()])) {
        if (changes.length >= 5) break;
        const previous = before.get(id), current = after.get(id);
        if (!previous || !current) {
            changes.push(`node ${id} ${current ? 'added' : 'removed'}`);
            continue;
        }
        if (previous.type !== current.type) changes.push(`node ${id} type`);
        for (const name of new Set([...previous.inputs.keys(), ...current.inputs.keys()])) {
            if (changes.length >= 5) break;
            if (previous.inputs.get(name) !== current.inputs.get(name)) {
                changes.push(`node ${id} input ${name}`);
            }
        }
    }
    return changes;
}

function validateDecisions(output, decisions) {
    for (const [id, inputs] of decisions) {
        const changes = changedDecisionInputs(inputs, decisionInputs(output, id));
        if (changes.length) {
            throw new Error(`Crystools bypass: checked inputs changed during preflight (${changes.join('; ')}); run again`);
        }
    }
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
            let entries = graphNodes(graph);
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
                const baseline = await app.graphToPrompt(graph);
                const requested = options?.partialExecutionTargets;
                const roots = requested?.length ? requested.map(String) :
                    Object.keys(baseline.output).filter(id =>
                        outputClasses.has(baseline.output[id].class_type));
                const reachable = ancestorPrompt(baseline.output,
                    roots.filter(id => baseline.output[id]), false);
                const active = entries.filter(entry => isControl(entry) &&
                    entry.node.mode !== 2 && entry.node.mode !== 4 && reachable[entry.id]);
                const checkedDecisions = new Map();
                for (const entry of orderedControls(baseline.output, active)) {
                    if (!isControl(entry)) continue;
                    const { id } = entry;
                    const stage = await app.graphToPrompt(graph);
                    const stageReachable = ancestorPrompt(stage.output,
                        roots.filter(root => stage.output[root]), false);
                    if (!stageReachable[id]) continue;
                    const checkedOutput = JSON.parse(JSON.stringify(ancestorPrompt(stage.output, [id], false)));
                    const checkedInputs = decisionInputs(checkedOutput, id);
                    checkedDecisions.set(id, checkedInputs);
                    const preflight = { workflow: stage.workflow,
                        output: ancestorPrompt(checkedOutput, [id]) };
                    // Check on the user's configured device, only as part of their Run.
                    const queued = await originalQueue.call(this, number, preflight,
                        { ...options, partialExecutionTargets: [id] }, ...rest);
                    const results = await completedProbe(queued.prompt_id);
                    if ((app.rootGraph ?? app.graph) !== graph) {
                        throw new Error('Crystools bypass: active workflow changed during preflight; run again');
                    }
                    const current = await app.graphToPrompt(graph);
                    if ((app.rootGraph ?? app.graph) !== graph) {
                        throw new Error('Crystools bypass: active workflow changed during preflight; run again');
                    }
                    validateDecisions(current.output, checkedDecisions);
                    const targets = new Set();
                    const states = results[id]?.crystools_empty_branch;
                    if (!Array.isArray(states) || !states.length ||
                        !states.every(state => typeof state === 'boolean' && state === states[0])) {
                        throw new Error(`Crystools bypass: node ${id} has no single empty-branch result`);
                    }
                    if (!states[0]) continue;
                    entries = graphNodes(graph);
                    // Serialized links already resolve reroutes and subgraph boundaries.
                    for (const entry of entries) {
                        const inputs = current.output[entry.id]?.inputs ?? {};
                        if (Object.values(inputs).some(value => Array.isArray(value) &&
                            value.length === 2 && String(value[0]) === id && value[1] === 0)) {
                            targets.add(entry.node);
                        }
                    }
                    for (const node of targets) {
                        if (node.mode === 2 || node.mode === 4) continue;
                        if (entries.filter(entry => entry.node === node).length > 1) {
                            throw new Error(`Crystools bypass: receiver ${node.id} is inside a shared subgraph; ` +
                                'its native mode affects every instance. Use a separate subgraph definition for this receiver.');
                        }
                        node.properties ??= {};
                        node.properties[OWNED_MODE] = node.mode;
                        node.mode = 4;
                    }
                    graph.setDirtyCanvas?.(true, true);
                }
                graph.setDirtyCanvas?.(true, true);
                const prompt = await app.graphToPrompt(graph);
                if ((app.rootGraph ?? app.graph) !== graph) {
                    throw new Error('Crystools bypass: active workflow changed during preflight; run again');
                }
                validateDecisions(prompt.output, checkedDecisions);
                const targets = requested?.length
                    ? requested.map(String).filter(id => prompt.output[id])
                    : Object.keys(prompt.output).filter(id =>
                        outputClasses.has(prompt.output[id].class_type));
                // Bypassing the last output is a valid canvas state, with no job to submit.
                if (!targets.length && entries.some(({ node }) =>
                    node.properties?.[OWNED_MODE] !== undefined)) return { node_errors: {} };
                const finalOptions = requested?.length
                    ? { ...options, partialExecutionTargets: targets } : options;
                return await originalQueue.call(this, number, prompt, finalOptions, ...rest);
            } catch (error) {
                const nodes = new Set([...entries, ...graphNodes(graph)].map(entry => entry.node));
                for (const node of nodes) {
                    if (node.properties?.[OWNED_MODE] !== undefined) {
                        node.mode = node.properties[OWNED_MODE];
                        delete node.properties[OWNED_MODE];
                    }
                }
                for (const [node, previous] of snapshot) {
                    node.mode = previous.mode;
                    node.properties[OWNED_MODE] = previous.original;
                }
                graph.setDirtyCanvas?.(true, true);
                throw error;
            }
        };
    },
});
