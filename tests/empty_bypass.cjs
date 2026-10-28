// Source-only regression fixture. Requires explicit permission before execution.
// Run: node --experimental-vm-modules --test tests/empty_bypass.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const SWITCH = 'CSWITCH_ANY_IF_EMPTY';
const PROBE = 'CSWITCH_ANY_IF_EMPTY_PROBE';

async function fixture({ empty = true, fail = false, terminal = false, proxied = false,
                         inputOverrides = {} } = {}) {
    let extension;
    const submissions = [];
    const graph = { _nodes: [], links: new Map(), setDirtyCanvas() {},
        getNodeById(id) { return this._nodes.find(node => node.id === id); } };
    function node(id, comfyClass, inputs = {}) {
        const value = { id, comfyClass, mode: 0, properties: {}, graph, inputs,
            outputs: [{ links: [] }], widgets: [] };
        graph._nodes.push(value);
        return value;
    }
    const source = node(1, 'Source');
    const control = node(2, SWITCH, { value: ['1', 0], on_false: ['1', 0] });
    control.widgets = [{ name: 'empty_action', value: 'bypass' }];
    const receiver = node(3, terminal ? 'Output' : 'Batch', { image: ['2', 0] });
    const downstream = terminal ? null : node(4, 'Output', { image: ['3', 0] });
    const booleanReceiver = node(5, 'BooleanReader', { value: ['2', 1] });
    control.outputs = [{ links: [1] }, { links: [2] }];
    graph.links.set(1, { target_id: 3 });
    graph.links.set(2, { target_id: 5 });
    const app = {
        rootGraph: graph,
        registerExtension(value) { extension = value; },
        async graphToPrompt() {
            const output = {};
            function visit(owner, prefix = '') {
              for (const value of owner._nodes) {
                if (value.subgraph) {
                    visit(value.subgraph, `${prefix}${value.id}:`);
                    continue;
                }
                if (value.comfyClass === 'Reroute') continue;
                if (value.mode === 2 || value.mode === 4) continue;
                const inputs = structuredClone(value.inputs);
                const id = `${prefix}${value.id}`;
                Object.assign(inputs, inputOverrides[id]);
                // Model native same-type bypass for this fixture's Batch.
                if (value === downstream && receiver.mode === 4) inputs.image = [...receiver.inputs.image];
                output[id] = { class_type: value.comfyClass, inputs };
                if (proxied) {
                    inputs.settings = new Proxy({ enabled: true }, {});
                    output[id] = new Proxy(output[id], {});
                }
              }
            }
            visit(graph);
            return { output, workflow: {} };
        },
    };
    const api = {
        async queuePrompt(number, data, options) {
            // Match the real API's JSON transport, which accepts reactive proxies.
            submissions.push({ number, data: JSON.parse(JSON.stringify(data)), options });
            return { prompt_id: `job-${submissions.length}`, node_errors: {} };
        },
        async fetchApi(url) {
            assert.match(url, /^\/history\/job-/);
            const id = url.slice('/history/'.length);
            const outputs = {};
            for (const [nodeId, entry] of Object.entries(submissions.at(-1).data.output)) {
                if (entry.class_type === PROBE) outputs[nodeId] = { crystools_empty_branch: [empty] };
            }
            return { ok: true, async json() {
                return { [id]: { status: { status_str: fail ? 'error' : 'success' }, outputs } };
            } };
        },
    };
    const context = vm.createContext({ structuredClone, setTimeout });
    const bridges = new Map();
    for (const [name, value] of Object.entries({ app, api })) {
        bridges.set(`../../scripts/${name}.js`, new vm.SyntheticModule([name], function () {
            this.setExport(name, value);
        }, { context }));
    }
    const module = new vm.SourceTextModule(fs.readFileSync(
        path.join(__dirname, '../web/emptyBypass.js'), 'utf8'), { context });
    await module.link(specifier => bridges.get(specifier));
    await module.evaluate();
    extension.beforeRegisterNodeDef({}, { name: 'Output', output_node: true });
    extension.setup();
    return { graph, node, source, control, receiver, downstream, booleanReceiver, submissions,
        async run(options) { return api.queuePrompt(0, await app.graphToPrompt(), options); } };
}

test('empty check makes only the direct any receiver purple and queues downstream work', async () => {
    const f = await fixture();
    await f.run();
    assert.equal(f.receiver.mode, 4);
    assert.equal(f.downstream.mode, 0);
    assert.equal(f.booleanReceiver.mode, 0);
    assert.equal(f.submissions.length, 2);
    assert.equal(f.submissions[0].data.output['2'].class_type, PROBE);
    assert.equal(f.submissions[0].data.output['3'], undefined);
    assert.equal(f.submissions[1].data.output['3'], undefined);
    assert.equal(f.submissions[1].data.output['4'].class_type, 'Output');
});

test('nonempty selected branch leaves receiver active', async () => {
    const f = await fixture({ empty: false });
    await f.run();
    assert.equal(f.receiver.mode, 0);
    assert.equal(f.submissions.at(-1).data.output['3'].class_type, 'Batch');
});

test('JSON-compatible proxy entries and nested inputs do not prevent native bypass', async () => {
    const f = await fixture({ proxied: true });
    await f.run();
    assert.equal(f.receiver.mode, 4);
    assert.equal(f.downstream.mode, 0);
    assert.equal(f.submissions.length, 2);
    assert.equal(f.submissions[0].data.output['2'].class_type, PROBE);
    assert.equal(f.submissions[1].data.output['2'].class_type, SWITCH);
    assert.deepEqual(f.submissions[0].data.output['2'].inputs.settings, { enabled: true });
});

test('omit mode does not submit a preflight', async () => {
    const f = await fixture();
    f.control.widgets[0].value = 'omit';
    await f.run();
    assert.equal(f.submissions.length, 1);
    assert.equal(f.receiver.mode, 0);
});

test('next run restores a receiver when bypass mode is turned off', async () => {
    const f = await fixture();
    await f.run();
    f.control.widgets[0].value = 'omit';
    await f.run();
    assert.equal(f.receiver.mode, 0);
    assert.equal(f.submissions.length, 3);
});

test('unrelated disconnected controls do not execute', async () => {
    const f = await fixture();
    const unused = f.node(8, SWITCH, { value: ['1', 0] });
    unused.widgets = [{ name: 'empty_action', value: 'bypass' }];
    await f.run();
    assert.equal(f.submissions.length, 2);
    assert.equal(f.submissions[0].data.output['8'], undefined);
});

test('failed preflight does not submit main work or change modes', async () => {
    const f = await fixture({ fail: true });
    await assert.rejects(f.run(), /failed or was interrupted/);
    assert.equal(f.submissions.length, 1);
    assert.equal(f.receiver.mode, 0);
});

test('bypassing the only output remains purple without submitting an invalid main job', async () => {
    const f = await fixture({ terminal: true });
    await f.run();
    assert.equal(f.submissions.length, 1);
    assert.equal(f.receiver.mode, 4);
});

test('bypass follows resolved links across nested subgraph output boundaries', async () => {
    for (const depth of [1, 2]) {
        const f = await fixture();
        f.graph._nodes = f.graph._nodes.filter(node => node !== f.control);
        const inner = { _nodes: [f.control], links: new Map(),
            getNodeById(id) { return this._nodes.find(node => node.id === id); } };
        f.control.graph = inner;
        inner.links.set(1, { target_id: -20, target_slot: 0 });
        inner.links.set(2, { target_id: -20, target_slot: 1 });
        const host = f.node(6, 'Subgraph');
        host.subgraph = inner;
        let controlId = '6:2';
        if (depth === 2) {
            f.graph._nodes = f.graph._nodes.filter(node => node !== host);
            const outer = f.node(7, 'Subgraph');
            outer.subgraph = { _nodes: [host] };
            controlId = '7:6:2';
        }
        f.receiver.inputs.image = [controlId, 0];
        f.booleanReceiver.inputs.value = [controlId, 1];
        await f.run();
        assert.equal(f.receiver.mode, 4);
        assert.equal(f.booleanReceiver.mode, 0);
        assert.equal(f.downstream.mode, 0);
        assert.equal(host.mode, 0);
        assert.equal(f.submissions.at(-1).data.output['4'].class_type, 'Output');
        assert.deepEqual(f.submissions.at(-1).data.output['4'].inputs.image, [controlId, 0]);
        assert.equal(f.submissions.at(-1).data.output[controlId].class_type, SWITCH);
    }
});

test('bypass skips a frontend reroute and changes the real receiver only', async () => {
    const f = await fixture();
    const reroute = f.node(6, 'Reroute');
    f.graph.links.set(1, { target_id: reroute.id, target_slot: 0 });
    await f.run();
    assert.equal(f.receiver.mode, 4);
    assert.equal(reroute.mode, 0);
    assert.equal(f.downstream.mode, 0);
});

test('manual receiver modes survive empty checks and later restoration', async () => {
    for (const mode of [2, 4]) {
        const f = await fixture();
        f.receiver.mode = mode;
        await f.run();
        f.control.widgets[0].value = 'omit';
        await f.run();
        assert.equal(f.receiver.mode, mode);
        assert.equal(f.receiver.properties.crystools_empty_bypass_original_mode, undefined);
    }
});

test('a target inside one subgraph is bypassed without bypassing its host', async () => {
    const f = await fixture();
    f.graph._nodes = f.graph._nodes.filter(node => node !== f.receiver);
    const host = f.node(6, 'Subgraph');
    host.subgraph = { _nodes: [f.receiver] };
    f.downstream.inputs.image = ['6:3', 0];
    await f.run();
    assert.equal(f.receiver.mode, 4);
    assert.equal(host.mode, 0);
    assert.equal(f.downstream.mode, 0);
    assert.deepEqual(f.submissions.at(-1).data.output['4'].inputs.image, ['2', 0]);
});

test('instance-specific bypass cannot silently change a shared sibling', async () => {
    const f = await fixture({ inputOverrides: { '7:3': { image: ['1', 0] } } });
    f.graph._nodes = f.graph._nodes.filter(node => node !== f.receiver);
    const shared = { _nodes: [f.receiver] };
    f.node(6, 'Subgraph').subgraph = shared;
    f.node(7, 'Subgraph').subgraph = shared;
    f.downstream.inputs.image = ['6:3', 0];
    f.node(8, 'Output', { image: ['7:3', 0] });
    await assert.rejects(f.run(), /shared subgraph/);
    assert.equal(f.receiver.mode, 0);
    assert.equal(f.downstream.mode, 0);
    assert.equal(f.submissions.length, 1);
});
