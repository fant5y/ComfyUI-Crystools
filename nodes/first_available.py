import torch
from comfy_api.latest import io
from comfy_execution.graph_utils import ExecutionBlocker

from ..core import CATEGORY
from ._names import CLASSES


def _empty(value: object) -> bool:
    if value is None or isinstance(value, ExecutionBlocker):
        return True
    if isinstance(value, str):
        return not value.strip()
    if isinstance(value, (bytes, bytearray, list, tuple, dict, set, frozenset)):
        return len(value) == 0
    if isinstance(value, torch.Tensor):
        return value.numel() == 0
    return False


def _node(graph: dict, node_id: object) -> dict | None:
    return next((node for node in graph.get('nodes', []) if str(node['id']) == str(node_id)), None)


def _link(graph: dict, link_id: object) -> tuple[object, int] | None:
    for link in graph.get('links', []):
        if isinstance(link, dict):
            if str(link['id']) == str(link_id):
                return link['origin_id'], link['origin_slot']
        elif str(link[0]) == str(link_id):
            return link[1], link[2]
    return None


def _active_source(
    graph: dict, link_id: object, definitions: dict[str, dict],
    parents: list[tuple[dict, dict]], visited: set[tuple[int, str]],
) -> bool:
    key = (id(graph), str(link_id))
    if key in visited:
        return False
    visited = visited | {key}
    link = _link(graph, link_id)
    if link is None:
        return True
    source_id, slot = link
    source = _node(graph, source_id)
    if source is None and parents:
        # Subgraph input boundary links refer to an IO node outside graph.nodes.
        parent, host = parents[-1]
        inputs = host.get('inputs', [])
        if slot < len(inputs):
            return _active_source(parent, inputs[slot].get('link'), definitions, parents[:-1], visited)
    if source is None:
        return True
    if source.get('mode') in (2, 4):
        return False
    definition = definitions.get(source.get('type'))
    if definition is not None:
        outputs = definition.get('outputs', [])
        links = outputs[slot].get('linkIds', []) if slot < len(outputs) else []
        if links:
            return _active_source(definition, links[0], definitions, parents + [(graph, source)], visited)
    elif source.get('type') == 'Reroute' and source.get('inputs'):
        return _active_source(graph, source['inputs'][0].get('link'), definitions, parents, visited)
    return True


class CSwitchAnyAuto(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_ANY_AUTO_NAME.value,
            display_name=CLASSES.CSWITCH_ANY_AUTO_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            description='Return the first non-empty input from top to bottom. Skip muted and bypassed sources.',
            inputs=[io.AnyType.Input(f'any_{index}', optional=True) for index in range(1, 101)],
            outputs=[io.AnyType.Output(display_name='any', is_output_list=True)],
            is_input_list=True,
            hidden=[io.Hidden.unique_id, io.Hidden.extra_pnginfo],
        )

    @classmethod
    def _enabled_inputs(cls) -> dict[str, bool]:
        metadata = getattr(cls.hidden, 'extra_pnginfo', None) or {}
        workflow = metadata.get('workflow', {})
        definitions = {item['id']: item for item in workflow.get('definitions', {}).get('subgraphs', [])}
        graph = workflow
        parents = []
        path = str(getattr(cls.hidden, 'unique_id', '')).split(':')
        for host_id in path[:-1]:
            host = _node(graph, host_id)
            if host is None or host.get('type') not in definitions:
                return {}
            parents.append((graph, host))
            graph = definitions[host['type']]
        node = _node(graph, path[-1])
        if node is None:
            return {}
        return {
            slot['name']: _active_source(graph, slot.get('link'), definitions, parents, set())
            for slot in node.get('inputs', [])
        }

    @classmethod
    def execute(cls, **values: list[object]) -> io.NodeOutput:
        enabled = cls._enabled_inputs()
        for index in range(1, 101):
            name = f'any_{index}'
            if not enabled.get(name, True):
                continue
            available = [value for value in values.get(name, []) if not _empty(value)]
            if available:
                return io.NodeOutput(available)
        return io.NodeOutput([ExecutionBlocker(None)])
