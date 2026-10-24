"""Exercise the optional switch against an installed ComfyUI, without a GPU.

Run: python tests/optional_switch.py --comfy-root K:/
"""

import argparse
import asyncio
import copy
import importlib
import pickle
from pathlib import Path
import sys
from types import ModuleType, SimpleNamespace
import unittest

parser = argparse.ArgumentParser()
parser.add_argument('--comfy-root', required=True)
arguments, remaining = parser.parse_known_args()
sys.path.insert(0, str(Path(arguments.comfy_root).resolve()))
sys.argv = [sys.argv[0], '--cpu']
import comfy.options
comfy.options.enable_args_parsing()
import execution
from comfy_api.latest import io

ROOT = Path(__file__).resolve().parents[1]
for name, directory in [('crystools_test', ROOT), ('crystools_test.core', ROOT / 'core'),
                        ('crystools_test.nodes', ROOT / 'nodes')]:
    package = ModuleType(name)
    package.__path__ = [str(directory)]
    sys.modules[name] = package
sys.modules['crystools_test.core'].CATEGORY = importlib.import_module('crystools_test.core.keys').CATEGORY


class Receiver:
    FUNCTION = 'execute'

    @classmethod
    def INPUT_TYPES(cls):
        return {'required': {}, 'optional': {'value': ('*',)}}

    def execute(self, value='default'):
        return (value,)


class V3Receiver(io.ComfyNode):
    @classmethod
    def define_schema(cls):
        return io.Schema(node_id='TestOptionalReceiver',
                         inputs=[io.AnyType.Input('value', optional=True)],
                         outputs=[io.AnyType.Output()])

    @classmethod
    def execute(cls, value='default'):
        return io.NodeOutput(value)


class OptionalInputs(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = importlib.import_module('crystools_test.core.optional')
        cls.module.install_optional_input_hook()

    def resolve(self, values, receiver=Receiver):
        cache = SimpleNamespace(get_cache=lambda *_: SimpleNamespace(outputs=[values]))
        return execution.get_input_data({'value': ['source', 0]}, receiver, 'receiver', cache)

    def invoke(self, values, receiver=Receiver, function='execute'):
        data, missing, metadata = self.resolve(values, receiver)
        instance = receiver if issubclass(receiver, io.ComfyNode) else receiver()
        async def run():
            results = await execution._async_map_node_over_list(
                'test', 'receiver', instance, data, function, v3_data=metadata)
            return await execution.resolve_map_node_over_list_results(results)
        return asyncio.run(run())

    def test_omits_optional_argument_for_v1_and_v3(self):
        for receiver in (Receiver, V3Receiver):
            with self.subTest(receiver=receiver):
                data, missing, _ = self.resolve([self.module.EMPTY], receiver)
                self.assertNotIn('value', data)
                self.assertNotIn('value', missing)
                result = self.invoke([self.module.EMPTY], receiver)[0]
                self.assertEqual(result[0], 'default')

    def test_none_and_real_streams_remain_unchanged(self):
        self.assertEqual(self.invoke([None]), [(None,)])
        self.assertEqual(self.invoke([0, False, 'text']), [(0,), (False,), ('text',)])
        self.assertEqual(self.invoke([self.module.EMPTY] * 3), [('default',)])

    def test_required_and_mixed_streams_are_rejected(self):
        class Required(Receiver):
            @classmethod
            def INPUT_TYPES(cls):
                return {'required': {'value': ('*',)}}
        with self.assertRaisesRegex(ValueError, 'required'):
            self.resolve([self.module.EMPTY], Required)
        with self.assertRaisesRegex(ValueError, 'mixed'):
            self.resolve([self.module.EMPTY, 'real'])

    def test_lazy_receiver_does_not_request_resolved_empty_again(self):
        class LazyReceiver(Receiver):
            def check_lazy_status(self, value=None):
                return ['value'] if value is None else []
        self.assertEqual(self.invoke([self.module.EMPTY], LazyReceiver, 'check_lazy_status'), [[]])

    def test_raw_links_are_preserved(self):
        class Raw(Receiver):
            @classmethod
            def INPUT_TYPES(cls):
                return {'optional': {'value': ('*', {'rawLink': True})}}
        self.assertEqual(self.resolve([self.module.EMPTY], Raw)[0]['value'], [['source', 0]])

    def test_cached_marker_and_idempotent_install(self):
        self.assertIs(copy.deepcopy(self.module.EMPTY), self.module.EMPTY)
        original = execution.get_input_data
        self.module.install_optional_input_hook()
        self.assertIs(execution.get_input_data, original)

    def test_serialized_marker_keeps_identity(self):
        self.assertIs(pickle.loads(pickle.dumps(self.module.EMPTY)), self.module.EMPTY)

    def test_undeclared_receiver_input_has_explanatory_error(self):
        class Undeclared(Receiver):
            @classmethod
            def INPUT_TYPES(cls):
                return {'required': {}}
        with self.assertRaisesRegex(ValueError, 'undeclared'):
            self.resolve([self.module.EMPTY], Undeclared)

    def test_list_receiver_and_v3_hidden_metadata(self):
        class ListReceiver(Receiver):
            INPUT_IS_LIST = True
        self.assertEqual(self.invoke([self.module.EMPTY], ListReceiver), [('default',)])
        self.assertEqual(self.invoke([1, 2], ListReceiver), [([1, 2],)])

        class HiddenReceiver(V3Receiver):
            @classmethod
            def define_schema(cls):
                return io.Schema(node_id='TestHiddenOptionalReceiver',
                                 inputs=[io.AnyType.Input('value', optional=True)],
                                 outputs=[io.AnyType.Output()], hidden=[io.Hidden.unique_id])

            @classmethod
            def execute(cls, value='default'):
                return io.NodeOutput((value, cls.hidden.unique_id))
        self.assertEqual(self.invoke([self.module.EMPTY], HiddenReceiver)[0][0], ('default', 'receiver'))


class SwitchSelection(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.module = importlib.import_module('crystools_test.core.optional')
        cls.switch = importlib.import_module('crystools_test.nodes.switch_if_empty').CSwitchAnyIfEmpty

    def test_branches_are_independently_optional_and_lazy(self):
        inputs = self.switch.INPUT_TYPES()
        for name in ('on_true', 'on_false'):
            self.assertIn(name, inputs['optional'])
            self.assertTrue(inputs['optional'][name][1]['lazy'])

    def test_is_empty_boolean_is_second_output(self):
        self.switch.INPUT_TYPES()
        self.assertEqual(len(self.switch.RETURN_TYPES), 2)
        self.assertEqual(self.switch.RETURN_TYPES[0], '*')
        self.assertEqual(self.switch.RETURN_TYPES[1], 'BOOLEAN')
        for value, expected in ((None, True), ('present', False), (0, False), (False, False)):
            with self.subTest(value=value):
                result = self.switch.execute(value=value, on_true='empty', on_false='valid')
                self.assertIs(result[1], expected)
                self.assertEqual(result[0], 'empty' if expected else 'valid')
                self.assertIs(self.switch.execute(value=value)[1], expected)
        self.assertIs(self.switch.execute(value=0, zero_is_empty=True)[1], True)

    def test_both_directions_and_unconnected_branches(self):
        for value, branch in ((None, 'on_true'), ('present', 'on_false')):
            with self.subTest(branch=branch):
                self.assertEqual(self.switch.execute(value=value, **{branch: 'chosen'})[0], 'chosen')
                self.assertIs(self.switch.execute(value=value)[0], self.module.EMPTY)
                self.assertIs(self.switch.execute(value=value, **{branch: None})[0], self.module.EMPTY)
                self.assertEqual(self.switch.check_lazy_status(value=value), [])
                self.assertEqual(self.switch.check_lazy_status(value=value, **{branch: None}), [branch])
                other = 'on_false' if branch == 'on_true' else 'on_true'
                self.assertEqual(self.switch.check_lazy_status(value=value, **{other: None}), [])

    def test_empty_types_and_valid_false_values(self):
        import torch
        for value in (None, '', '  ', [], {}, (), b'', torch.empty(0), self.module.EMPTY):
            with self.subTest(value=value):
                self.assertEqual(self.switch.execute(value=value, on_true='empty', on_false='valid')[0], 'empty')
        for value in (0, False, torch.ones(2), {'value': None}, [None]):
            with self.subTest(value=value):
                self.assertEqual(self.switch.execute(value=value, on_true='empty', on_false='valid')[0], 'valid')
        self.assertEqual(self.switch.execute(value=0, zero_is_empty=True, on_true='zero')[0], 'zero')


class WorkflowExecution(unittest.TestCase):
    def test_real_scheduler_lazy_branches_and_cached_empty(self):
        import nodes
        switch = importlib.import_module('crystools_test.nodes.switch_if_empty').CSwitchAnyIfEmpty
        module = importlib.import_module('crystools_test.core.optional')
        module.install_optional_input_hook()
        calls = []

        class Source(Receiver):
            RETURN_TYPES = ('*',)

            @classmethod
            def INPUT_TYPES(cls):
                return {'required': {'kind': ('STRING',)}}

            def execute(self, kind):
                calls.append(kind)
                if kind == 'unused':
                    raise AssertionError('Unselected branch executed')
                return (None if kind == 'empty' else kind,)

        class Sink(Receiver):
            OUTPUT_NODE = True
            RETURN_TYPES = ()

            def check_lazy_status(self, value=None):
                return ['value'] if value is None else []

            def execute(self, value='default'):
                calls.append(('sink', value))
                return ()

        mappings = {'TestEmptySource': Source, 'TestEmptySwitch': switch, 'TestEmptySink': Sink}
        previous = {name: nodes.NODE_CLASS_MAPPINGS.get(name) for name in mappings}
        nodes.NODE_CLASS_MAPPINGS.update(mappings)
        server = SimpleNamespace(client_id=None, last_node_id=None,
                                 send_sync=lambda *args, **kwargs: None,
                                 queue_updated=lambda: None)
        try:
            cases = [('empty', 'on_false', 'unused', 'default'),
                     ('present', 'on_true', 'unused', 'default'),
                     ('empty', 'on_true', 'empty', 'default'),
                     ('present', 'on_false', 'chosen', 'chosen')]
            for case_index, (check, connected, branch_value, expected) in enumerate(cases):
                executor = execution.PromptExecutor(server, cache_args={'ram': 0, 'ram_inactive': 0})
                prompt = {
                    'source': {'class_type': 'TestEmptySource', 'inputs': {'kind': check}},
                    'branch': {'class_type': 'TestEmptySource', 'inputs': {'kind': branch_value}},
                    'switch': {'class_type': 'TestEmptySwitch', 'inputs': {
                        'value': ['source', 0], connected: ['branch', 0], 'zero_is_empty': False}},
                    'sink': {'class_type': 'TestEmptySink', 'inputs': {'value': ['switch', 0]}},
                }
                for run in range(2):
                    async def execute_prompt():
                        validation = await execution.validate_prompt(f'{case_index}-{run}', prompt, None)
                        self.assertTrue(validation[0], validation)
                        await asyncio.wait_for(executor.execute_async(prompt, f'{case_index}-{run}', execute_outputs=['sink']), 10)
                    asyncio.run(execute_prompt())
                    self.assertTrue(executor.success, executor.status_messages)
                cached = asyncio.run(executor.caches.outputs.get('switch'))
                if expected == 'default':
                    self.assertIs(cached.outputs[0][0], module.EMPTY)
                else:
                    self.assertEqual(cached.outputs[0][0], expected)
            self.assertEqual(calls.count(('sink', 'default')), 3)
            self.assertEqual(calls.count(('sink', 'chosen')), 1)
            self.assertNotIn('unused', calls)
        finally:
            for name, original in previous.items():
                if original is None:
                    nodes.NODE_CLASS_MAPPINGS.pop(name, None)
                else:
                    nodes.NODE_CLASS_MAPPINGS[name] = original


if __name__ == '__main__':
    unittest.main(argv=[sys.argv[0], *remaining])
