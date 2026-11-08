import { api, app } from './comfy/index.js';
const PIPE_TO = 'Pipe to/edit any [Crystools]';
const PIPE_FROM = 'Pipe from any [Crystools]';
const CAPACITY = 100;
const SWITCH_ANY_AUTO = 'CSWITCH_ANY_AUTO';
const SWITCH_ANY_IF_EMPTY = 'CSWITCH_ANY_IF_EMPTY';
const PASS_ANY = 'Pass any [Crystools]';
const EXPORTED_PIPE_LABELS = 'crystools_exported_pipe_labels';
const isPipe = (node) => node.type === PIPE_TO || node.type === PIPE_FROM;
const isDefaultPipeName = (name) => /^CPipeAny(?:_\d+)?$/.test(name);
const isDefaultPipeSlot = (slot) => slot.type === 'CPipeAny' && isDefaultPipeName(slot.name);
const isSwitch = (node) => node.type === SWITCH_ANY_AUTO || node.type === SWITCH_ANY_IF_EMPTY;
const pendingGraphs = new WeakSet();
let templateLayouts = new WeakMap();
let backwardLayouts = new WeakMap();
let collectingTemplates = false;
let activeContext = new Map();
const displayContext = (graph) => {
    const context = new Map();
    const visited = new Set();
    while (graph && graph !== (graph.rootGraph || graph) && !visited.has(graph)) {
        visited.add(graph);
        const selected = activeContext.get(graph);
        const host = selected?.graph?._nodes.includes(selected) ? selected : uniqueHost(graph);
        if (!host) {
            break;
        }
        context.set(graph, host);
        graph = host.graph;
    }
    return context;
};
const candidates = (value) => value ? [value, ...value.alternatives || []].map(({ alternatives: _alternatives, ...field }) => field) : [];
const identity = (value) => JSON.stringify([value.label, String(value.type)]);
const identifyLayout = (values) => {
    const owners = new Map();
    const next = new Map();
    const layouts = Array.from(values, candidates);
    for (const fields of layouts) {
        for (const field of fields) {
            if (field.occurrence !== undefined) {
                next.set(identity(field), Math.max(next.get(identity(field)) || 0, field.occurrence + 1));
            }
        }
    }
    return layouts.map((fields, index) => {
        for (const field of [...fields].sort((left, right) => Number(left.occurrence === undefined) -
            Number(right.occurrence === undefined))) {
            const key = identity(field);
            const occupied = field.occurrence !== undefined ? owners.get(`${key}:${field.occurrence}`) : undefined;
            if (field.occurrence === undefined || occupied !== undefined && occupied !== index) {
                field.occurrence = next.get(key) || 0;
                next.set(key, field.occurrence + 1);
            }
            owners.set(`${key}:${field.occurrence}`, index);
        }
        const first = fields[0];
        return first ? { ...first, alternatives: fields.slice(1) } : undefined;
    });
};
const replaceDescription = (replacement, fallback) => {
    if (!replacement) {
        return fallback;
    }
    const fields = candidates(replacement);
    for (const field of candidates(fallback)) {
        const match = fields.find(candidate => identity(candidate) === identity(field));
        if (match) {
            match.occurrence = field.occurrence;
        }
        else {
            fields.push(field);
        }
    }
    return { ...fields[0], alternatives: fields.slice(1) };
};
const orderedInputs = (node) => {
    if (!node.graph) {
        return [];
    }
    node.properties || (node.properties = {});
    const connected = node.inputs.map((_slot, index) => ({ id: node.getInputLink(index)?.id, index }))
        .filter(slot => slot.id !== undefined && slot.id !== null);
    const previous = node.properties['crystools_input_order'];
    const order = Array.isArray(previous) ?
        previous.filter(id => connected.some(slot => slot.id === id)) : [];
    for (const slot of connected) {
        if (!order.includes(slot.id)) {
            order.push(slot.id);
        }
    }
    node.properties['crystools_input_order'] = order;
    return order.map(id => connected.find(slot => slot.id === id).index);
};
const branchInputs = (node) => node.type === SWITCH_ANY_IF_EMPTY ?
    node.inputs.flatMap((slot, index) => ['on_true', 'on_false'].includes(slot.name) && node.getInputLink(index) ? [index] : []) :
    orderedInputs(node);
const contextKey = (node, context) => {
    const path = [node.id];
    let graph = node.graph;
    const visited = new Set();
    while (graph && graph !== (graph.rootGraph || graph) && !visited.has(graph)) {
        visited.add(graph);
        const host = context.get(graph) || uniqueHost(graph);
        if (!host) {
            return `definition:${node.id}`;
        }
        path.unshift(host.id);
        graph = host.graph;
    }
    return path.join(':');
};
const groupLabel = (node) => {
    if (!node.pos) {
        return undefined;
    }
    const bounds = node.boundingRect || [node.pos[0], node.pos[1], node.size[0], node.size[1]];
    const x = bounds[0] + bounds[2] / 2;
    const y = bounds[1] + bounds[3] / 2;
    const groups = (node.graph?.groups || []).filter(group => {
        const rect = group.boundingRect;
        return x >= rect[0] && x <= rect[0] + rect[2] && y >= rect[1] && y <= rect[1] + rect[3];
    });
    groups.sort((left, right) => left.boundingRect[2] * left.boundingRect[3] -
        right.boundingRect[2] * right.boundingRect[3]);
    return groups[0]?.title;
};
const refreshGroupLabel = (node) => {
    const output = node.outputs[0];
    if (!output) {
        return false;
    }
    node.properties || (node.properties = {});
    const previous = node.properties['crystools_group_label'];
    const label = groupLabel(node);
    if (label === previous && (!label || output.label === label)) {
        return false;
    }
    if (!previous && label) {
        node.properties['crystools_manual_pipe_label'] = output.label || output.name;
    }
    const manual = node.properties['crystools_manual_pipe_label'];
    output.label = label || (typeof manual === 'string' ? manual : output.name);
    node.properties['crystools_group_label'] = label;
    return true;
};
const upstreamPipeLabel = (node, context, visited) => {
    if (!node.graph || visited.has(contextKey(node, context))) {
        return undefined;
    }
    const parent = resolveSource(node.graph, node.getInputLink(0), context, new Set(visited).add(contextKey(node, context)));
    return parent ? describeOutput(parent)?.label : undefined;
};
const pipeOutputLabel = (node, slot, context, visited) => {
    const group = groupLabel(node);
    const manual = node.properties?.['crystools_manual_pipe_label'];
    const own = node.properties?.['crystools_group_label'] ? manual : slot.label;
    const inherited = node.properties?.['crystools_inherited_pipe_label'];
    if (group || typeof own === 'string' && own !== slot.name && own !== inherited) {
        return group || own;
    }
    return upstreamPipeLabel(node, context, visited) || slot.name;
};
const refreshPipeLabel = (node) => {
    refreshGroupLabel(node);
    const context = displayContext(node.graph);
    const input = node.inputs[0];
    if (input) {
        input.label = upstreamPipeLabel(node, context, new Set()) || input.name;
    }
    const output = node.outputs[0];
    if (!output) {
        return;
    }
    const label = pipeOutputLabel(node, output, context, new Set());
    if (!groupLabel(node) && (!output.label || output.label === output.name ||
        output.label === node.properties?.['crystools_inherited_pipe_label'])) {
        node.properties || (node.properties = {});
        node.properties['crystools_inherited_pipe_label'] = label;
        output.label = label;
    }
};
const graphsOf = (graph) => {
    const root = graph.rootGraph || graph;
    return [root, ...Array.from(root.subgraphs?.values() || [])];
};
const uniqueHost = (graph) => {
    const hosts = graphsOf(graph).flatMap(owner => owner._nodes.filter(node => node.subgraph === graph));
    return hosts.length === 1 ? hosts[0] : undefined;
};
const outerInputLink = (graph, host, index) => {
    const slot = host.inputs[index];
    if (!slot || host.isInputConnected?.(index) === false) {
        return undefined;
    }
    const matches = (link) => link?.target_id === host.id && link.target_slot === index;
    const cached = slot.link === null || slot.link === undefined ? undefined : graph.links.get(slot.link);
    if (matches(cached)) {
        return cached;
    }
    for (const link of graph.links.values()) {
        if (matches(link)) {
            return link;
        }
    }
    return undefined;
};
const inheritedExportLabels = (host) => host.properties?.[EXPORTED_PIPE_LABELS];
const explicitExportLabel = (host, index) => {
    const output = host.outputs[index];
    if (!output) {
        return undefined;
    }
    const boundary = host.subgraph?.outputNode?.slots[index];
    const inherited = inheritedExportLabels(host)?.[output.name];
    const label = output.label === inherited ? boundary?.label || output.name : output.label || output.name;
    return isDefaultPipeName(label) || label === 'any' || label === '*' ? undefined : label;
};
const resolveSource = (graph, link, context, visited, inputPath = new Set(), inactive = false) => {
    if (!link) {
        return undefined;
    }
    if (graph.inputNode?.id === link.origin_id) {
        const host = context.get(graph) || uniqueHost(graph);
        const boundary = host ? `${contextKey(host, context)}:input:${link.origin_slot}` : undefined;
        if (!boundary || inputPath.has(boundary)) {
            return undefined;
        }
        if (!host?.graph) {
            return undefined;
        }
        return resolveSource(host.graph, outerInputLink(host.graph, host, link.origin_slot), context, visited, new Set(inputPath).add(boundary), inactive || host.mode === 2 || host.mode === 4);
    }
    const node = graph.getNodeById(link.origin_id);
    if (!node || visited.has(contextKey(node, context))) {
        return undefined;
    }
    const unavailable = inactive || node.mode === 2 || node.mode === 4;
    if (node.subgraph) {
        const innerLink = node.subgraph.outputNode?.slots[link.origin_slot]?.getLinks()[0];
        const source = resolveSource(node.subgraph, innerLink, new Map(context).set(node.subgraph, node), new Set(visited).add(contextKey(node, context)), inputPath, unavailable);
        const label = explicitExportLabel(node, link.origin_slot);
        if (source && label) {
            source.exportedLabel = label;
        }
        return source;
    }
    if (node.type === 'Reroute') {
        return resolveSource(graph, node.getInputLink(0), context, new Set(visited).add(contextKey(node, context)), inputPath, unavailable);
    }
    return { node, index: link.origin_slot, context, visited, inactive: unavailable };
};
export const pipeCacheContext = (root, executionId) => {
    const path = executionId.split(':');
    const context = new Map();
    let graph = root;
    for (const id of path.slice(0, -1)) {
        const host = graph._nodes.find(node => String(node.id) === id);
        if (!host?.subgraph) {
            throw new Error(`Crystools cache: missing subgraph ${id}`);
        }
        context.set(host.subgraph, host);
        graph = host.subgraph;
    }
    const node = graph._nodes.find(candidate => String(candidate.id) === path[path.length - 1]);
    if (!node) {
        throw new Error(`Crystools cache: missing node ${executionId}`);
    }
    const properties = node.properties || {};
    const layouts = properties['crystools_pipe_layouts'];
    const layout = layouts?.[executionId] ?? properties['crystools_pipe_layout'] ?? [];
    const enabled = node.type === SWITCH_ANY_AUTO ? node.inputs.map((slot, index) => [
        slot.name, !resolveSource(graph, node.getInputLink(index), context, new Set())?.inactive,
    ]) : undefined;
    return JSON.stringify({ layout, enabled });
};
const describeOutput = (source) => {
    const { node, index, visited, context } = source;
    if (node.type === PIPE_FROM && index > 0) {
        return describePipe(node, visited, context)[index - 1];
    }
    if (isSwitch(node) && index === 0) {
        return describeSwitch(node, visited, context);
    }
    if (node.type === PASS_ANY && node.graph && !visited.has(contextKey(node, context))) {
        const upstream = resolveSource(node.graph, node.getInputLink(0), context, new Set(visited).add(contextKey(node, context)));
        return upstream ? describeOutput(upstream) : undefined;
    }
    const slot = node.outputs[index];
    if (!slot) {
        return undefined;
    }
    const canvas = app.canvas;
    const type = slot.type;
    return {
        label: isPipe(node) && index === 0 ? source.exportedLabel || pipeOutputLabel(node, slot, context, visited) :
            slot.label || slot.name || String(slot.type),
        type,
        color_on: slot.color_on || canvas.default_connection_color_byType[type],
        color_off: slot.color_off || canvas.default_connection_color_byTypeOff[type],
    };
};
const describeSwitch = (node, visited, context) => {
    if (!node.graph || visited.has(contextKey(node, context))) {
        return undefined;
    }
    const path = new Set(visited).add(contextKey(node, context));
    const values = branchInputs(node).sort((left, right) => left - right).map(index => {
        const source = resolveSource(node.graph, node.getInputLink(index), context, path);
        return { description: source ? describeOutput(source) : undefined, inactive: source?.inactive };
    });
    const first = values.find(value => !value.inactive && value.description)?.description;
    const type = first && values.every(value => value.description?.type === first.type) ? first.type : '*';
    return first ? { ...first, type } : undefined;
};
const refreshSwitchOutput = (node) => {
    const output = node.outputs[0];
    if (!output) {
        return false;
    }
    const previous = [output.label, output.type, output.color_on, output.color_off];
    decorateSlot(output, describeSwitch(node, new Set(), displayContext(node.graph)), true);
    updateOutputLinkTypes(node, 0, output);
    return [output.label, output.type, output.color_on, output.color_off]
        .some((value, index) => value !== previous[index]);
};
const refreshPass = (node) => {
    const input = node.inputs[0];
    const output = node.outputs[0];
    if (!input || !output || !node.graph) {
        return;
    }
    const source = resolveSource(node.graph, node.getInputLink(0), displayContext(node.graph), new Set());
    const value = source ? describeOutput(source) : undefined;
    decorateSlot(input, value, false, true);
    decorateSlot(output, value, true);
    updateOutputLinkTypes(node, 0, output);
    const size = node.computeSize();
    if (size[0] > node.size[0]) {
        node.setSize([size[0], node.size[1]]);
    }
};
const pipeSources = (node, visited, context) => {
    if (!node.graph || visited.has(contextKey(node, context))) {
        return undefined;
    }
    const sources = [];
    for (const index of branchInputs(node)) {
        const source = resolveSource(node.graph, node.getInputLink(index), context, new Set(visited).add(contextKey(node, context)));
        if (!source || !(isPipe(source.node) && source.index === 0 ||
            isSwitch(source.node) && source.index === 0 &&
                pipeSources(source.node, source.visited, source.context)?.length)) {
            return undefined;
        }
        sources.push(source);
    }
    return sources;
};
const fieldKeys = (values) => {
    const counts = new Map();
    return Array.from(values, value => {
        if (!value) {
            return undefined;
        }
        const key = identity(value);
        const occurrence = value.occurrence ?? counts.get(key) ?? 0;
        counts.set(key, Math.max(counts.get(key) || 0, occurrence + 1));
        return JSON.stringify([value.label, String(value.type), occurrence]);
    });
};
const mergeLayouts = (layouts) => {
    const values = (layouts[0] || []).map(value => candidates(value)[0]);
    const known = new Set(fieldKeys(values).filter(key => key !== undefined));
    for (const layout of layouts) {
        const fields = layout.flatMap(candidates);
        fieldKeys(fields).forEach((key, index) => {
            if (key !== undefined && !known.has(key)) {
                known.add(key);
                values.push(fields[index]);
            }
        });
    }
    if (values.length > CAPACITY) {
        throw new Error(`Crystools pipe branches contain ${values.length} fields; the limit is ${CAPACITY}`);
    }
    return values;
};
const saveLayout = (node, values) => {
    node.properties || (node.properties = {});
    const serializeField = (value) => ({
        label: value.label, type: String(value.type), occurrence: value.occurrence,
        ...(value.alternatives?.length ? { alternatives: value.alternatives.map(serializeField) } : {}),
    });
    const serialize = (layout) => Array.from(layout, value => value ? serializeField(value) : null);
    node.properties['crystools_pipe_layout'] = serialize(values);
    const instances = {};
    const visit = (graph, context, path) => {
        if (graph === node.graph) {
            instances[[...path, node.id].join(':')] = serialize(describePipe(node, new Set(), context));
        }
        for (const host of graph._nodes) {
            if (host.subgraph && !context.has(host.subgraph)) {
                visit(host.subgraph, new Map(context).set(host.subgraph, host), [...path, host.id]);
            }
        }
    };
    if (node.graph && node.graph !== (node.graph.rootGraph || node.graph)) {
        visit(node.graph.rootGraph, new Map(), []);
    }
    node.properties['crystools_pipe_layouts'] = instances;
};
const describePipe = (node, visited = new Set(), context = displayContext(node.graph)) => {
    if (!node.graph || visited.has(contextKey(node, context))) {
        return [];
    }
    if (node.type === SWITCH_ANY_AUTO) {
        const sources = pipeSources(node, visited, context) || [];
        return mergeLayouts(sources.map(source => describePipe(source.node, source.visited, source.context)));
    }
    if (node.type === SWITCH_ANY_IF_EMPTY) {
        const values = [];
        for (const source of pipeSources(node, visited, context) || []) {
            describePipe(source.node, source.visited, source.context).forEach((value, index) => {
                values[index] = replaceDescription(values[index], value);
            });
        }
        return identifyLayout(values);
    }
    const path = new Set(visited).add(contextKey(node, context));
    const parent = resolveSource(node.graph, node.getInputLink(0), context, path);
    const values = parent && (isPipe(parent.node) || isSwitch(parent.node) && parent.index === 0) ?
        describePipe(parent.node, parent.visited, parent.context) : [];
    if (node.type === PIPE_TO) {
        node.inputs.slice(1).forEach((_slot, index) => {
            const source = resolveSource(node.graph, node.getInputLink(index + 1), context, path);
            if (source) {
                values[index] || (values[index] = describeOutput(source));
            }
        });
    }
    if (!collectingTemplates && node.type === PIPE_TO) {
        const template = templateLayouts.get(node)?.get(contextKey(node, context)) || [];
        const declared = new Set(fieldKeys(identifyLayout(values)));
        template.forEach((value, index) => {
            if (!values[index] && value && !declared.has(fieldKeys([value])[0])) {
                values[index] = value;
            }
        });
    }
    return identifyLayout(values);
};
const decorateSlot = (slot, value, output, typed = output) => {
    const fields = candidates(value);
    slot.label = output && fields.length ? [...new Set(fields.map(field => field.label))].join(' / ') :
        value?.label || slot.name;
    slot.type = typed && fields.every(field => field.type === value?.type) ? value?.type || '*' : '*';
    slot.color_on = value?.color_on;
    slot.color_off = value?.color_off;
};
const updateOutputLinkTypes = (node, index, slot) => {
    if (!node.graph) {
        return;
    }
    if (node.setOutputDataType) {
        node.setOutputDataType(index, slot.type);
        return;
    }
    for (const id of slot.links || []) {
        const link = node.graph.links.get(id);
        if (link) {
            link.type = slot.type;
        }
    }
};
const connectedRange = (node, input, first = 1) => {
    const slots = input ? node.inputs : node.outputs;
    for (let index = slots.length - 1; index >= first; index--) {
        if (input ? node.graph && node.getInputLink(index) :
            node.isOutputConnected?.(index) ?? slots[index]?.links?.length) {
            return index;
        }
    }
    return first - 1;
};
const refreshNode = (node) => {
    refreshPipeLabel(node);
    const values = describePipe(node);
    const input = node.type === PIPE_TO;
    if (input) {
        saveLayout(node, values);
    }
    const hints = backwardLayouts.get(node)?.get(contextKey(node, displayContext(node.graph)));
    hints?.forEach((field, index) => {
        if (field && !values[index]) {
            values[index] = field;
        }
    });
    const slots = input ? node.inputs : node.outputs;
    const connectedCount = connectedRange(node, input);
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
        decorateSlot(slot, values[index], !input, true);
        if (!input) {
            updateOutputLinkTypes(node, index + 1, slot);
        }
    });
    const size = node.computeSize();
    if (slots.length !== oldLength || size[0] > node.size[0]) {
        node.setSize([Math.max(node.size[0], size[0]), slots.length !== oldLength ? size[1] : node.size[1]]);
    }
};
const refreshSwitch = (node) => {
    const lastConnected = connectedRange(node, true, 0);
    saveLayout(node, describePipe(node));
    refreshSwitchOutput(node);
    const count = Math.min(CAPACITY, Math.max(2, lastConnected + 2));
    const oldLength = node.inputs.length;
    while (node.inputs.length > count) {
        node.removeInput(node.inputs.length - 1);
    }
    while (node.inputs.length < count) {
        node.addInput(`any_${node.inputs.length + 1}`, '*');
    }
    node.inputs.forEach((slot, index) => {
        const source = node.graph && resolveSource(node.graph, node.getInputLink(index), displayContext(node.graph), new Set());
        decorateSlot(slot, source ? describeOutput(source) : undefined, false);
    });
    const size = node.computeSize();
    if (oldLength !== count || size[0] > node.size[0]) {
        node.setSize([Math.max(node.size[0], size[0]), oldLength !== count ? size[1] : node.size[1]]);
    }
};
const templateTargets = (source, depth = 0) => {
    const { node, context, visited } = source;
    if (!node.graph || visited.has(contextKey(node, context))) {
        return [];
    }
    if (isSwitch(node) && source.index === 0) {
        return (pipeSources(node, visited, context) || []).flatMap(branch => templateTargets(branch, depth + 1));
    }
    if (!isPipe(node) || source.index !== 0) {
        return [];
    }
    const parent = resolveSource(node.graph, node.getInputLink(0), context, new Set(visited).add(contextKey(node, context)));
    return [...(node.type === PIPE_TO ? [{ source, depth }] : []),
        ...(parent ? templateTargets(parent, depth) : [])];
};
const recordBackwardHints = (source, fields) => {
    const { node, context } = source;
    let instances = backwardLayouts.get(node);
    if (!instances) {
        instances = new Map();
        backwardLayouts.set(node, instances);
    }
    const key = contextKey(node, context);
    const layout = instances.get(key) || [];
    for (const { index, field } of fields) {
        const existing = layout[index];
        if (existing === undefined) {
            layout[index] = field;
        }
        else if (existing && identity(existing) !== identity(field)) {
            layout[index] = null;
        }
    }
    instances.set(key, layout);
};
const collectBackwardHints = (editor, graph, context) => {
    const visited = new Set([contextKey(editor, context)]);
    const fields = editor.inputs.slice(1).flatMap((_slot, index) => {
        const source = resolveSource(graph, editor.getInputLink(index + 1), context, visited);
        const field = source && describeOutput(source);
        return field ? [{ index, field }] : [];
    });
    if (!fields.length) {
        return;
    }
    let parent = resolveSource(graph, editor.getInputLink(0), context, visited);
    while (parent && isPipe(parent.node) && parent.index === 0 && parent.node.graph) {
        recordBackwardHints(parent, fields);
        parent = resolveSource(parent.node.graph, parent.node.getInputLink(0), parent.context, new Set(parent.visited).add(contextKey(parent.node, parent.context)));
    }
};
const collectTemplates = (root, includeBackwardHints = false) => {
    templateLayouts = new WeakMap();
    if (includeBackwardHints) {
        backwardLayouts = new WeakMap();
    }
    const proposals = [];
    const visit = (graph, context) => {
        for (const node of graph._nodes.filter(candidate => candidate.type === SWITCH_ANY_AUTO)) {
            const sources = pipeSources(node, new Set(), context) || [];
            const first = sources[0];
            if (first) {
                const layout = describePipe(first.node, first.visited, first.context);
                for (const branch of sources.slice(1)) {
                    for (const target of templateTargets(branch)) {
                        proposals.push({ ...target, owner: contextKey(node, context), layout });
                    }
                }
            }
        }
        graph._nodes.filter(node => includeBackwardHints && node.type === PIPE_TO)
            .forEach(node => collectBackwardHints(node, graph, context));
        for (const host of graph._nodes.filter(candidate => candidate.subgraph)) {
            if (!context.has(host.subgraph)) {
                visit(host.subgraph, new Map(context).set(host.subgraph, host));
            }
        }
    };
    collectingTemplates = true;
    try {
        visit(root, new Map());
    }
    finally {
        collectingTemplates = false;
    }
    proposals.sort((left, right) => left.depth - right.depth || left.owner.localeCompare(right.owner));
    for (const { source, layout } of proposals) {
        let instances = templateLayouts.get(source.node);
        if (!instances) {
            instances = new Map();
            templateLayouts.set(source.node, instances);
        }
        const key = contextKey(source.node, source.context);
        const values = instances.get(key) || [];
        layout.forEach((value, index) => {
            values[index] || (values[index] = value);
        });
        instances.set(key, values);
    }
};
const refresh = (node) => {
    if (node.type === PASS_ANY) {
        refreshPass(node);
    }
    else if (node.type === SWITCH_ANY_AUTO) {
        refreshSwitch(node);
    }
    else if (node.type === SWITCH_ANY_IF_EMPTY) {
        refreshSwitchOutput(node);
        node.inputs.forEach((slot, index) => {
            if (!['on_true', 'on_false'].includes(slot.name)) {
                return;
            }
            const source = node.graph && resolveSource(node.graph, node.getInputLink(index), displayContext(node.graph), new Set());
            decorateSlot(slot, source ? describeOutput(source) : undefined, false);
        });
    }
    else {
        refreshNode(node);
    }
};
export const preparePipeLayouts = (graph) => {
    const root = graph.rootGraph || graph;
    collectTemplates(root);
    for (const owner of graphsOf(root)) {
        for (const node of owner._nodes) {
            if (node.type === PIPE_TO || node.type === SWITCH_ANY_AUTO) {
                saveLayout(node, describePipe(node));
            }
        }
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
            collectTemplates(root, true);
            for (const owner of graphsOf(root)) {
                observeGraph(owner);
                owner._nodes.filter(node => isPipe(node) || isSwitch(node) || node.type === PASS_ANY).forEach(refresh);
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
const observePipeOutputLabels = (graph) => {
    const slots = graph.outputNode?.slots.filter(isDefaultPipeSlot);
    for (const slot of slots ?? []) {
        if (Object.prototype.hasOwnProperty.call(slot, 'displayName') || !Object.isExtensible(slot)) {
            continue;
        }
        const prototype = Object.getPrototypeOf(slot);
        if (!prototype || !('displayName' in prototype)) {
            continue;
        }
        Object.defineProperty(slot, 'displayName', {
            configurable: true,
            get() {
                const nativeName = Reflect.get(prototype, 'displayName', slot);
                if (typeof (slot.label ?? slot.localized_name) === 'string') {
                    return nativeName;
                }
                const link = slot.getLinks()[0];
                const pipe = link?.origin_slot === 0 ? graph.getNodeById(link.origin_id) : null;
                return pipe && isPipe(pipe) ? pipe.outputs[0]?.label || nativeName : nativeName;
            },
        });
    }
};
const refreshHostPipeLabels = (host, graph) => {
    const previous = inheritedExportLabels(host);
    const inherited = {};
    const context = displayContext(graph);
    host.outputs.forEach((output, index) => {
        if (!isDefaultPipeSlot(output) || explicitExportLabel(host, index)) {
            return;
        }
        const source = resolveSource(graph, { origin_id: host.id, origin_slot: index }, context, new Set());
        const label = source && isPipe(source.node) ? describeOutput(source)?.label : undefined;
        if (label && !isDefaultPipeName(label)) {
            output.label = label;
            inherited[output.name] = label;
        }
        else if (output.label === previous?.[output.name]) {
            output.label = undefined;
        }
    });
    if (Object.keys(inherited).length) {
        host.properties || (host.properties = {});
        host.properties[EXPORTED_PIPE_LABELS] = inherited;
    }
    else if (previous && host.properties) {
        delete host.properties[EXPORTED_PIPE_LABELS];
    }
};
const observeGraph = (graph) => {
    observePipeOutputLabels(graph);
    if (!observedGraphs.has(graph)) {
        observedGraphs.add(graph);
        const changed = graph.onAfterChange;
        graph.onAfterChange = function (...args) {
            const result = changed?.apply(this, args);
            scheduleRefresh(this);
            return result;
        };
        for (const event of [
            'configured', 'node:added', 'node:removed', 'subgraph-created', 'convert-to-subgraph',
            'node:slot-label:changed',
        ]) {
            graph.events?.addEventListener(event, () => scheduleRefresh(graph));
        }
    }
    for (const host of graph._nodes.filter(node => node.subgraph)) {
        refreshHostPipeLabels(host, graph);
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
        api.addEventListener('graphChanged', () => scheduleRefresh(app.rootGraph));
        const canvas = app.canvas.canvas;
        canvas?.addEventListener('subgraph-opened', event => {
            const { subgraph, closingGraph, fromNode } = event.detail;
            activeContext = displayContext(closingGraph);
            activeContext.set(subgraph, fromNode);
            scheduleRefresh(app.rootGraph);
        });
        canvas?.addEventListener('litegraph:set-graph', event => {
            const { newGraph } = event.detail;
            if (newGraph === app.rootGraph) {
                activeContext = new Map();
            }
            scheduleRefresh(app.rootGraph);
        });
        scheduleRefresh(app.rootGraph);
    },
    beforeRegisterNodeDef(nodeType, nodeData) {
        if (![PIPE_TO, PIPE_FROM, SWITCH_ANY_AUTO, SWITCH_ANY_IF_EMPTY, PASS_ANY].includes(nodeData.name)) {
            return;
        }
        const prototype = nodeType.prototype;
        const draw = prototype.onDrawForeground;
        prototype.onDrawForeground = function (...args) {
            const result = draw?.apply(this, args);
            if (this.type === PASS_ANY) {
                refreshPass(this);
                return result;
            }
            const changed = isSwitch(this) ? refreshSwitchOutput(this) : refreshGroupLabel(this);
            if (changed) {
                scheduleRefresh(this.graph);
            }
            return result;
        };
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
                if (this.type === SWITCH_ANY_AUTO) {
                    orderedInputs(this);
                }
                scheduleRefresh(this.graph || graph);
                return result;
            };
        }
    },
});
