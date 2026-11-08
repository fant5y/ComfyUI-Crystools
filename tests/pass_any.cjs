const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const PASS = 'Pass any [Crystools]';
let extension;
const app = {
  registerExtension(value) { extension = value; },
  canvas: {
    canvas: new EventTarget(),
    default_connection_color_byType: {IMAGE: '#image'},
    default_connection_color_byTypeOff: {IMAGE: '#image-off'},
  },
};
const context = vm.createContext({console, queueMicrotask, CustomEvent});
const bridge = new vm.SyntheticModule(['app','api'], function() {
  this.setExport('app', app);
  this.setExport('api', new EventTarget());
}, {context});
const graph = {
  events: new EventTarget(), subgraphs: new Map(), _nodes: [], links: new Map(),
  getNodeById(id) { return this._nodes.find(node => node.id === id); },
  setDirtyCanvas() {},
};
graph.rootGraph = graph;
app.rootGraph = graph;
let nextNodeId = 1;
let nextLinkId = 1;

class Node {
  constructor(type) {
    this.id = nextNodeId++;
    this.type = type;
    this.inputs = [{name: 'value', type: '*', link: null}];
    this.outputs = [{name: 'value', type: '*', links: []}];
    this.size = [200, 25];
    this.onNodeCreated?.();
    this.graph = graph;
    graph._nodes.push(this);
    this.onAdded?.(graph);
  }
  getInputLink(index) { return graph.links.get(this.inputs[index]?.link) || null; }
  computeSize() { return [200, 25]; }
  setSize(size) { this.size = size; }
}
class PassNode extends Node { constructor() { super(PASS); } }

function connect(source, target) {
  const id = nextLinkId++;
  graph.links.set(id, {origin_id: source.id, origin_slot: 0, type: source.outputs[0].type});
  source.outputs[0].links.push(id);
  target.inputs[0].link = id;
  target.onConnectionsChange?.(1, 0, true);
  source.onConnectionsChange?.(2, 0, true);
}

function disconnect(source, target) {
  const id = target.inputs[0].link;
  graph.links.delete(id);
  source.outputs[0].links = source.outputs[0].links.filter(value => value !== id);
  target.inputs[0].link = null;
  target.onConnectionsChange?.(1, 0, false);
  source.onConnectionsChange?.(2, 0, false);
}

const flush = () => new Promise(resolve => setImmediate(resolve));

(async () => {
  const source = fs.readFileSync(path.join(__dirname, '../web/pipe.js'), 'utf8');
  const module = new vm.SourceTextModule(source, {context});
  await module.link(() => bridge);
  await module.evaluate();
  extension.setup();
  extension.beforeRegisterNodeDef(PassNode, {name: PASS});

  const image = new Node('Image');
  image.outputs[0] = {name: 'image', label: 'Photo', type: 'IMAGE', links: []};
  const first = new PassNode();
  const second = new PassNode();
  const consumer = new Node('Consumer');
  connect(image, first);
  connect(first, second);
  connect(second, consumer);
  await flush();
  assert.equal(first.inputs[0].label, 'Photo');
  assert.equal(first.inputs[0].type, 'IMAGE');
  assert.equal(first.outputs[0].label, 'Photo');
  assert.equal(second.outputs[0].type, 'IMAGE');
  assert.equal(graph.links.get(consumer.inputs[0].link).type, 'IMAGE');

  image.outputs[0].label = 'Reference Image';
  graph.onAfterChange?.();
  await flush();
  assert.equal(second.outputs[0].label, 'Reference Image');

  disconnect(image, first);
  await flush();
  assert.equal(first.inputs[0].label, 'value');
  assert.equal(first.outputs[0].type, '*');
  assert.equal(second.outputs[0].type, '*');
  assert.equal(graph.links.get(consumer.inputs[0].link).type, '*');
  console.log('Pass any connection, type, label, chaining, rename, and disconnect checks passed');
})().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
