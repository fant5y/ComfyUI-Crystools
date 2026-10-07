import { app } from './comfy/index.js';

const PIPE_TO = 'Pipe to/edit any [Crystools]';
const PIPE_FROM = 'Pipe from any [Crystools]';
const CAPACITY = 100;
const SWITCH_ANY_AUTO = 'CSWITCH_ANY_AUTO';

interface Slot {
  name: string;
  label?: string;
  type: string | number;
  link?: number | string | null;
  links?: (number | string)[] | null;
  color_on?: string;
  color_off?: string;
}

interface Link {
  origin_id: number | string;
  origin_slot: number;
  type?: string | number;
}

interface PipeGraph {
  groups?: {title: string; boundingRect: ArrayLike<number>}[];
  rootGraph?: PipeGraph;
  subgraphs?: Map<string, PipeGraph>;
  inputNode?: {id: number | string};
  outputNode?: {slots: {getLinks(): Link[]}[]};
  events?: {addEventListener(type: string, callback: () => void): void};
  onAfterChange?: (...args: unknown[]) => unknown;
  _nodes: PipeNode[];
  links: Map<number | string, Link>;
  getNodeById(id: number | string): PipeNode | null;
  setDirtyCanvas(foreground: boolean, background: boolean): void;
}

interface PipeNode {
  id: number | string;
  type: string;
  mode?: number;
  properties?: Record<string, unknown>;
  graph?: PipeGraph;
  subgraph?: PipeGraph;
  inputs: Slot[];
  outputs: Slot[];
  size: [number, number];
  pos?: [number, number];
  boundingRect?: ArrayLike<number>;
  getInputLink(index: number): Link | null;
  addInput(name: string, type: string): void;
  addOutput(name: string, type: string): void;
  removeInput(index: number): void;
  removeOutput(index: number): void;
  computeSize(): [number, number];
  setSize(size: [number, number]): void;
  onNodeCreated?: (...args: unknown[]) => unknown;
  onConfigure?: (...args: unknown[]) => unknown;
  onAdded?: (...args: unknown[]) => unknown;
  onRemoved?: (...args: unknown[]) => unknown;
  onConnectionsChange?: (...args: unknown[]) => unknown;
  onDrawForeground?: (...args: unknown[]) => unknown;
}

interface ValueDescription {
  label: string;
  type: string | number;
  color_on?: string;
  color_off?: string;
  occurrence?: number;
  alternatives?: ValueDescription[];
}

const isPipe = (node: PipeNode): boolean => node.type === PIPE_TO || node.type === PIPE_FROM;
const pendingGraphs = new WeakSet<PipeGraph>();
let templateLayouts = new WeakMap<PipeNode, Map<string, (ValueDescription | undefined)[]>>();
let collectingTemplates = false;
let activeContext: InstanceContext = new Map();

type InstanceContext = Map<PipeGraph, PipeNode>;

const displayContext = (graph: PipeGraph | undefined): InstanceContext => {
  const context: InstanceContext = new Map();
  const visited = new Set<PipeGraph>();
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

const candidates = (value: ValueDescription | undefined): ValueDescription[] =>
  value ? [value, ...value.alternatives || []].map(({alternatives: _alternatives, ...field}) => field) : [];

const identity = (value: ValueDescription): string => JSON.stringify([value.label, String(value.type)]);

// Reserve inherited occurrences before allocating identities for replacements.
const identifyLayout = (values: (ValueDescription | undefined)[]): (ValueDescription | undefined)[] => {
  const owners = new Map<string, number>();
  const next = new Map<string, number>();
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
    return first ? {...first, alternatives: fields.slice(1)} : undefined;
  });
};

const replaceDescription = (
  replacement: ValueDescription | undefined, fallback: ValueDescription | undefined,
): ValueDescription | undefined => {
  if (!replacement) {
    return fallback;
  }
  const fields = candidates(replacement);
  for (const field of candidates(fallback)) {
    const match = fields.find(candidate => identity(candidate) === identity(field));
    if (match) {
      match.occurrence = field.occurrence;
    } else {
      fields.push(field);
    }
  }
  return {...fields[0]!, alternatives: fields.slice(1)};
};

interface Source {
  node: PipeNode;
  index: number;
  context: InstanceContext;
  visited: Set<string>;
  inactive: boolean;
}

const orderedInputs = (node: PipeNode): number[] => {
  node.properties ||= {};
  const connected = node.inputs.map((slot, index) => ({id: slot.link, index}))
    .filter(slot => slot.id !== undefined && slot.id !== null);
  const previous = node.properties['crystools_input_order'];
  const order: (number | string)[] = Array.isArray(previous) ?
    previous.filter(id => connected.some(slot => slot.id === id)) : [];
  for (const slot of connected) {
    if (!order.includes(slot.id!)) {
      order.push(slot.id!);
    }
  }
  node.properties['crystools_input_order'] = order;
  return order.map(id => connected.find(slot => slot.id === id)!.index);
};

const contextKey = (node: PipeNode, context: InstanceContext): string => {
  const path = [node.id];
  let graph = node.graph;
  const visited = new Set<PipeGraph>();
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

const groupLabel = (node: PipeNode): string | undefined => {
  if (!node.pos) {
    return undefined;
  }
  const bounds = node.boundingRect || [node.pos[0], node.pos[1], node.size[0], node.size[1]];
  const x = bounds[0]! + bounds[2]! / 2;
  const y = bounds[1]! + bounds[3]! / 2;
  const groups = (node.graph?.groups || []).filter(group => {
    const rect = group.boundingRect;
    return x >= rect[0]! && x <= rect[0]! + rect[2]! && y >= rect[1]! && y <= rect[1]! + rect[3]!;
  });
  groups.sort((left, right) => left.boundingRect[2]! * left.boundingRect[3]! -
    right.boundingRect[2]! * right.boundingRect[3]!);
  return groups[0]?.title;
};

// eslint-disable-next-line complexity
const refreshGroupLabel = (node: PipeNode): boolean => {
  const output = node.outputs[0];
  if (!output) {
    return false;
  }
  node.properties ||= {};
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

// eslint-disable-next-line complexity
const pipeOutputLabel = (
  node: PipeNode, slot: Slot, context: InstanceContext, visited: Set<string>,
): string => {
  const group = groupLabel(node);
  const manual = node.properties?.['crystools_manual_pipe_label'];
  const own = node.properties?.['crystools_group_label'] ? manual : slot.label;
  const inherited = node.properties?.['crystools_inherited_pipe_label'];
  if (group || typeof own === 'string' && own !== slot.name && own !== inherited) {
    return group || own as string;
  }
  if (!node.graph || visited.has(contextKey(node, context))) {
    return slot.name;
  }
  const parent = resolveSource(node.graph, node.getInputLink(0), context,
    new Set(visited).add(contextKey(node, context)));
  return parent ? describeOutput(parent)?.label || slot.name : slot.name;
};

const refreshPipeLabel = (node: PipeNode): void => {
  refreshGroupLabel(node);
  const output = node.outputs[0];
  if (!output) {
    return;
  }
  const label = pipeOutputLabel(node, output, displayContext(node.graph), new Set());
  if (!groupLabel(node) && (!output.label || output.label === output.name ||
    output.label === node.properties?.['crystools_inherited_pipe_label'])) {
    node.properties ||= {};
    node.properties['crystools_inherited_pipe_label'] = label;
    output.label = label;
  }
};

const graphsOf = (graph: PipeGraph): PipeGraph[] => {
  const root = graph.rootGraph || graph;
  return [root, ...Array.from(root.subgraphs?.values() || [])];
};

const uniqueHost = (graph: PipeGraph): PipeNode | undefined => {
  const hosts = graphsOf(graph).flatMap(owner => owner._nodes.filter(node => node.subgraph === graph));
  // Shared definitions have no single external input; callers carry instance context.
  return hosts.length === 1 ? hosts[0] : undefined;
};

// eslint-disable-next-line complexity
const resolveSource = (
  graph: PipeGraph, link: Link | null | undefined, context: InstanceContext,
  visited: Set<string>, inputPath = new Set<string>(), inactive = false,
): Source | undefined => {
  if (!link) {
    return undefined;
  }
  if (graph.inputNode?.id === link.origin_id) {
    const host = context.get(graph) || uniqueHost(graph);
    const boundary = host ? `${contextKey(host, context)}:input:${link.origin_slot}` : undefined;
    if (!boundary || inputPath.has(boundary)) {
      return undefined;
    }
    const externalLinkId = host?.inputs[link.origin_slot]?.link;
    if (!host?.graph || (typeof externalLinkId !== 'number' && typeof externalLinkId !== 'string')) {
      return undefined;
    }
    return resolveSource(
      host.graph, host.graph.links.get(externalLinkId), context, visited, new Set(inputPath).add(boundary),
      inactive || host.mode === 2 || host.mode === 4,
    );
  }
  const node = graph.getNodeById(link.origin_id);
  if (!node || visited.has(contextKey(node, context))) {
    return undefined;
  }
  const unavailable = inactive || node.mode === 2 || node.mode === 4;
  if (node.subgraph) {
    const innerLink = node.subgraph.outputNode?.slots[link.origin_slot]?.getLinks()[0];
    return resolveSource(
      node.subgraph, innerLink, new Map(context).set(node.subgraph, node),
      new Set(visited).add(contextKey(node, context)),
      inputPath, unavailable,
    );
  }
  if (node.type === 'Reroute') {
    return resolveSource(
      graph, node.getInputLink(0), context, new Set(visited).add(contextKey(node, context)), inputPath, unavailable,
    );
  }
  return {node, index: link.origin_slot, context, visited, inactive: unavailable};
};

// eslint-disable-next-line complexity
const describeOutput = (source: Source): ValueDescription | undefined => {
  const {node, index, visited, context} = source;
  if (node.type === PIPE_FROM && index > 0) {
    return describePipe(node, visited, context)[index - 1];
  }
  if (node.type === SWITCH_ANY_AUTO) {
    return describeSwitch(node, visited, context);
  }
  const slot = node.outputs[index];
  if (!slot) {
    return undefined;
  }
  const canvas = app.canvas;
  const type = slot.type;
  return {
    label: isPipe(node) && index === 0 ? pipeOutputLabel(node, slot, context, visited) :
      slot.label || slot.name || String(slot.type),
    type,
    color_on: slot.color_on || canvas.default_connection_color_byType[type],
    color_off: slot.color_off || canvas.default_connection_color_byTypeOff[type],
  };
};

const describeSwitch = (
  node: PipeNode, visited: Set<string>, context: InstanceContext,
): ValueDescription | undefined => {
  if (!node.graph || visited.has(contextKey(node, context))) {
    return undefined;
  }
  const path = new Set(visited).add(contextKey(node, context));
  const values = orderedInputs(node).sort((left, right) => left - right).map(index => {
    const source = resolveSource(node.graph!, node.getInputLink(index), context, path);
    return {description: source ? describeOutput(source) : undefined, inactive: source?.inactive};
  });
  const first = values.find(value => !value.inactive && value.description)?.description;
  const type = first && values.every(value => value.description?.type === first.type) ? first.type : '*';
  return first ? {...first, type} : undefined;
};

const refreshSwitchOutput = (node: PipeNode): boolean => {
  const output = node.outputs[0];
  if (!output) {
    return false;
  }
  const previous = [output.label, output.type, output.color_on, output.color_off];
  decorateSlot(output, describeSwitch(node, new Set(), displayContext(node.graph)), true);
  output.links?.forEach(id => {
    const link = node.graph?.links.get(id);
    if (link) {
      link.type = output.type;
    }
  });
  return [output.label, output.type, output.color_on, output.color_off]
    .some((value, index) => value !== previous[index]);
};

// eslint-disable-next-line complexity
const pipeSources = (
  node: PipeNode, visited: Set<string>, context: InstanceContext,
): Source[] | undefined => {
  if (!node.graph || visited.has(contextKey(node, context))) {
    return undefined;
  }
  const sources: Source[] = [];
  for (const index of orderedInputs(node)) {
    const source = resolveSource(
      node.graph, node.getInputLink(index), context, new Set(visited).add(contextKey(node, context)),
    );
    if (!source || !(isPipe(source.node) && source.index === 0 ||
      source.node.type === SWITCH_ANY_AUTO && pipeSources(source.node, source.visited, source.context)?.length)) {
      return undefined;
    }
    sources.push(source);
  }
  return sources;
};

const fieldKeys = (values: (ValueDescription | undefined)[]): (string | undefined)[] => {
  const counts = new Map<string, number>();
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

const mergeLayouts = (layouts: (ValueDescription | undefined)[][]): (ValueDescription | undefined)[] => {
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

const saveLayout = (node: PipeNode, values: (ValueDescription | undefined)[]): void => {
  node.properties ||= {};
  // Native node properties are serialized into workflow metadata for execution.
  const serializeField = (value: ValueDescription): Record<string, unknown> => ({
    label: value.label, type: String(value.type), occurrence: value.occurrence,
    ...(value.alternatives?.length ? {alternatives: value.alternatives.map(serializeField)} : {}),
  });
  const serialize = (layout: (ValueDescription | undefined)[]): (Record<string, unknown> | null)[] =>
    Array.from(layout, value => value ? serializeField(value) : null);
  node.properties['crystools_pipe_layout'] = serialize(values);
  const instances: Record<string, unknown> = {};
  const visit = (graph: PipeGraph, context: InstanceContext, path: (number | string)[]): void => {
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
    visit(node.graph.rootGraph!, new Map(), []);
  }
  node.properties['crystools_pipe_layouts'] = instances;
};

// eslint-disable-next-line complexity
const describePipe = (
  node: PipeNode, visited = new Set<string>(), context: InstanceContext = displayContext(node.graph),
): (ValueDescription | undefined)[] => {
  if (!node.graph || visited.has(contextKey(node, context))) {
    return [];
  }
  if (node.type === SWITCH_ANY_AUTO) {
    const sources = pipeSources(node, visited, context) || [];
    return mergeLayouts(sources.map(source => describePipe(source.node, source.visited, source.context)));
  }
  const path = new Set(visited).add(contextKey(node, context));
  const parent = resolveSource(node.graph, node.getInputLink(0), context, path);
  const values = parent && (isPipe(parent.node) || parent.node.type === SWITCH_ANY_AUTO) ?
    describePipe(parent.node, parent.visited, parent.context) : [];
  if (node.type === PIPE_TO) {
    node.inputs.slice(1).forEach((_slot, index) => {
      const source = resolveSource(node.graph!, node.getInputLink(index + 1), context, path);
      if (source) {
        values[index] = replaceDescription(describeOutput(source), values[index]);
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

const decorateSlot = (slot: Slot, value: ValueDescription | undefined, output: boolean): void => {
  // Labels change; input names remain the stable server keys any_1, any_2, ...
  const fields = candidates(value);
  slot.label = output && fields.length ? [...new Set(fields.map(field => field.label))].join(' / ') :
    value?.label || slot.name;
  slot.type = output && fields.every(field => field.type === value?.type) ? value?.type || '*' : '*';
  slot.color_on = value?.color_on;
  slot.color_off = value?.color_off;
};

const connectedRange = (slots: Slot[], input: boolean): number => {
  let count = 0;
  slots.slice(1).forEach((slot, index) => {
    if (input ? slot.link !== null && slot.link !== undefined : slot.links?.length) {
      count = index + 1;
    }
  });
  return count;
};

// eslint-disable-next-line complexity
const refreshNode = (node: PipeNode): void => {
  refreshPipeLabel(node);
  const values = describePipe(node);
  const input = node.type === PIPE_TO;
  if (input) {
    saveLayout(node, values);
  }
  const slots = input ? node.inputs : node.outputs;
  const connectedCount = connectedRange(slots, input);
  const count = Math.min(CAPACITY, Math.max(6, values.length + (input ? 1 : 0), connectedCount + (input ? 1 : 0)));
  const oldLength = slots.length;
  while (slots.length > count + 1) {
    if (input) {
      node.removeInput(slots.length - 1);
    } else {
      node.removeOutput(slots.length - 1);
    }
  }
  while (slots.length < count + 1) {
    if (input) {
      node.addInput(`any_${slots.length}`, '*');
    } else {
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

const refreshSwitch = (node: PipeNode): void => {
  let lastConnected = -1;
  node.inputs.forEach((slot, index) => {
    if (slot.link !== null && slot.link !== undefined) {
      lastConnected = index;
    }
  });
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
    const source = node.graph && resolveSource(
      node.graph, node.getInputLink(index), displayContext(node.graph), new Set(),
    );
    decorateSlot(slot, source ? describeOutput(source) : undefined, false);
  });
  const size = node.computeSize();
  if (oldLength !== count || size[0] > node.size[0]) {
    node.setSize([Math.max(node.size[0], size[0]), oldLength !== count ? size[1] : node.size[1]]);
  }
};

// Follow whole-pipe ancestry, keeping shared subgraph instances distinct.
// eslint-disable-next-line complexity
const templateTargets = (source: Source, depth = 0): {source: Source; depth: number}[] => {
  const {node, context, visited} = source;
  if (!node.graph || visited.has(contextKey(node, context))) {
    return [];
  }
  if (node.type === SWITCH_ANY_AUTO) {
    return (pipeSources(node, visited, context) || []).flatMap(branch => templateTargets(branch, depth + 1));
  }
  if (!isPipe(node) || source.index !== 0) {
    return [];
  }
  const parent = resolveSource(node.graph, node.getInputLink(0), context,
    new Set(visited).add(contextKey(node, context)));
  return [...(node.type === PIPE_TO ? [{source, depth}] : []),
    ...(parent ? templateTargets(parent, depth) : [])];
};

const collectTemplates = (root: PipeGraph): void => {
  templateLayouts = new WeakMap();
  const proposals: {source: Source; depth: number; owner: string; layout: (ValueDescription | undefined)[]}[] = [];
  const visit = (graph: PipeGraph, context: InstanceContext): void => {
    for (const node of graph._nodes.filter(candidate => candidate.type === SWITCH_ANY_AUTO)) {
      const sources = pipeSources(node, new Set(), context) || [];
      const first = sources[0];
      if (first) {
        const layout = describePipe(first.node, first.visited, first.context);
        for (const branch of sources.slice(1)) {
          for (const target of templateTargets(branch)) {
            proposals.push({...target, owner: contextKey(node, context), layout});
          }
        }
      }
    }
    for (const host of graph._nodes.filter(candidate => candidate.subgraph)) {
      if (!context.has(host.subgraph!)) {
        visit(host.subgraph!, new Map(context).set(host.subgraph!, host));
      }
    }
  };
  collectingTemplates = true;
  try {
    visit(root, new Map());
  } finally {
    collectingTemplates = false;
  }
  // A nearer switch defines its branch first; outer templates fill only gaps.
  proposals.sort((left, right) => left.depth - right.depth || left.owner.localeCompare(right.owner));
  for (const {source, layout} of proposals) {
    let instances = templateLayouts.get(source.node);
    if (!instances) {
      instances = new Map();
      templateLayouts.set(source.node, instances);
    }
    const key = contextKey(source.node, source.context);
    const values = instances.get(key) || [];
    layout.forEach((value, index) => {
      values[index] ||= value;
    });
    instances.set(key, values);
  }
};

const refresh = (node: PipeNode): void => {
  if (node.type === SWITCH_ANY_AUTO) {
    refreshSwitch(node);
  } else {
    refreshNode(node);
  }
};

const scheduleRefresh = (graph: PipeGraph | undefined): void => {
  const root = graph?.rootGraph || graph;
  if (!root || pendingGraphs.has(root)) {
    return;
  }
  pendingGraphs.add(root);
  queueMicrotask(() => {
    try {
      collectTemplates(root);
      for (const owner of graphsOf(root)) {
        observeGraph(owner);
        owner._nodes.filter(node => isPipe(node) || node.type === SWITCH_ANY_AUTO).forEach(refresh);
        owner.setDirtyCanvas(true, true);
      }
    } finally {
      pendingGraphs.delete(root);
    }
  });
};

const observedGraphs = new WeakSet<PipeGraph>();
const observedHosts = new WeakSet<PipeNode>();

const observeGraph = (graph: PipeGraph): void => {
  if (!observedGraphs.has(graph)) {
    observedGraphs.add(graph);
    const changed = graph.onAfterChange;
    graph.onAfterChange = function(this: PipeGraph, ...args: unknown[]): unknown {
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
    if (observedHosts.has(host)) {
      continue;
    }
    observedHosts.add(host);
    const original = host.onConnectionsChange;
    host.onConnectionsChange = function(this: PipeNode, ...args: unknown[]): unknown {
      const result = original?.apply(this, args);
      scheduleRefresh(this.graph);
      return result;
    };
  }
};

app.registerExtension({
  name: 'Crystools.Pipes',
  setup(): void {
    observeGraph(app.rootGraph);
    const canvas = app.canvas.canvas as EventTarget | undefined;
    canvas?.addEventListener('subgraph-opened', event => {
      const {subgraph, closingGraph, fromNode} = (event as CustomEvent<{
        subgraph: PipeGraph; closingGraph: PipeGraph; fromNode: PipeNode;
      }>).detail;
      activeContext = displayContext(closingGraph);
      activeContext.set(subgraph, fromNode);
      scheduleRefresh(app.rootGraph);
    });
    canvas?.addEventListener('litegraph:set-graph', event => {
      const {newGraph} = (event as CustomEvent<{newGraph: PipeGraph}>).detail;
      if (newGraph === app.rootGraph) {
        activeContext = new Map();
      }
      scheduleRefresh(app.rootGraph);
    });
    scheduleRefresh(app.rootGraph);
  },
  beforeRegisterNodeDef(nodeType: {prototype: PipeNode}, nodeData: {name: string}): void {
    if (![PIPE_TO, PIPE_FROM, SWITCH_ANY_AUTO].includes(nodeData.name)) {
      return;
    }
    const prototype = nodeType.prototype;
    const draw = prototype.onDrawForeground;
    prototype.onDrawForeground = function(this: PipeNode, ...args: unknown[]): unknown {
      const result = draw?.apply(this, args);
      const changed = this.type === SWITCH_ANY_AUTO ? refreshSwitchOutput(this) : refreshGroupLabel(this);
      if (changed) {
        scheduleRefresh(this.graph);
      }
      return result;
    };
    const created = prototype.onNodeCreated;
    prototype.onNodeCreated = function(this: PipeNode, ...args: unknown[]): unknown {
      const result = created?.apply(this, args);
      refresh(this);
      return result;
    };
    for (const hook of ['onConfigure', 'onAdded', 'onRemoved', 'onConnectionsChange'] as const) {
      const original = prototype[hook];
      prototype[hook] = function(this: PipeNode, ...args: unknown[]): unknown {
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
