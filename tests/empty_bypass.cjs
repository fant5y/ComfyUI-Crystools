// Source-only regression fixture. Requires explicit permission before execution.
// Run: node --experimental-vm-modules --test tests/empty_bypass.cjs
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { test } = require('node:test');

const SWITCH = 'CSWITCH_ANY_IF_EMPTY';
const PROBE = 'CSWITCH_ANY_IF_EMPTY_PROBE';

async function fixture({ empty = true, fail = false, terminal = false } = {}) {
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
            for (const value of graph._nodes) {
                if (value.mode === 2 || value.mode === 4) continue;
                const inputs = structuredClone(value.inputs);
                // Model native same-type bypass for this fixture's Batch.
                if (value === downstream && receiver.mode === 4) inputs.image = ['2', 0];
                output[value.id] = { class_type: value.comfyClass, inputs };
            }
            return { output, workflow: {} };
        },
    };
    const api = {
        async queuePrompt(number, data, options) {
            submissions.push({ number, data: structuredClone(data), options });
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
