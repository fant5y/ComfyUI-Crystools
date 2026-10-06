from comfy_api.latest import io
from comfy_execution.graph import get_input_info
from comfy_execution.graph_utils import GraphBuilder, is_link
from nodes import NODE_CLASS_MAPPINGS
from ..core import CATEGORY
from ..core.pipe import PipeValues, empty_value, pipe_layout
from ._names import CLASSES


PIPE_CAPACITY = 100
PIPE_EDIT_INTERNAL = 'Crystools Pipe Edit Internal [Crystools]'
PIPE_GUARD_INTERNAL = 'Crystools Pipe Override Guard [Crystools]'


def required_pipe_fields(dynprompt: object, node_id: str,
                         visited: set[str]) -> set[tuple[str, int]]:
    if node_id in visited:
        return set()
    visited.add(node_id)
    source = dynprompt.get_node(node_id)
    if source['class_type'] in (CLASSES.CPIPE_TO_ANY_NAME.value, CLASSES.CPIPE_FROM_ANY_NAME.value):
        return set()
    node_class = NODE_CLASS_MAPPINGS.get(source['class_type'])
    if node_class is None:
        return set()
    fields = set()
    for name, link in source.get('inputs', {}).items():
        if not is_link(link):
            continue
        input_type, category, options = get_input_info(node_class, name)
        if options and (options.get('lazy') or options.get('rawLink')):
            continue
        upstream = dynprompt.get_node(link[0])
        if upstream['class_type'] == CLASSES.CPIPE_FROM_ANY_NAME.value and link[1] > 0:
            # Wildcard checks may intentionally inspect None. A required typed
            # processing input needs an actual field before its branch can run.
            if category == 'required' and input_type != '*':
                fields.add((link[0], int(link[1]) - 1))
        else:
            fields.update(required_pipe_fields(dynprompt, link[0], visited))
    return fields


def edit_pipe(pipe_source: list[object] | None, values: dict[str, object],
              descriptions: list[dict | None]) -> PipeValues:
    pipe = list(pipe_source) if pipe_source is not None else []
    supplied_slots = [int(name[4:]) for name in values if name.startswith('any_')]
    length = max(6, len(pipe), max(supplied_slots, default=0))
    if length > PIPE_CAPACITY:
        raise ValueError(f'Crystools pipes support up to {PIPE_CAPACITY} values')
    pipe.extend([None] * (length - len(pipe)))
    inherited = getattr(pipe_source, 'layout', [])
    layout = list(inherited) + [None] * max(0, length - len(inherited))
    for index in range(length):
        value = values.get(f'any_{index + 1}')
        if not empty_value(value):
            pipe[index] = value
            layout[index] = descriptions[index] if index < len(descriptions) else None
    return PipeValues(pipe, layout)


class CPipeToAny(io.ComfyNode):
    @classmethod
    def fingerprint_inputs(cls, **values: object) -> float:
        # Workflow labels are hidden metadata, outside ComfyUI's input cache key.
        return float('NaN')

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CPIPE_TO_ANY_NAME.value,
            display_name=CLASSES.CPIPE_TO_ANY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PIPE.value,
            inputs=[
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Input(
                    CLASSES.CPIPE_ANY_TYPE.value, optional=True, raw_link=True),
                *[io.AnyType.Input(f'any_{index}', optional=True, raw_link=True, lazy=True)
                  for index in range(1, PIPE_CAPACITY + 1)],
            ],
            outputs=[io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Output()],
            hidden=[io.Hidden.unique_id, io.Hidden.extra_pnginfo, io.Hidden.dynprompt],
            enable_expand=True,
        )

    @classmethod
    def execute(cls, CPipeAny: list[object] | None = None, **values: object) -> io.NodeOutput:
        descriptions = pipe_layout(cls.hidden)
        dynprompt = getattr(cls.hidden, 'dynprompt', None)
        if dynprompt is None:
            return io.NodeOutput(edit_pipe(CPipeAny, values, descriptions))

        dependencies = {}
        guards = {}
        for name, value in values.items():
            if not is_link(value):
                continue
            fields = required_pipe_fields(dynprompt, value[0], set())
            if fields:
                dependencies[name] = []
                for source_id, index in sorted(fields):
                    guard_name = f'guard_{source_id}'
                    guards[guard_name] = [source_id, 0]
                    dependencies[name].append((guard_name, index))

        graph = GraphBuilder()
        context = {'layout': descriptions}
        if dependencies:
            context.update(values=values, dependencies=dependencies, display_id=cls.hidden.unique_id)
            editor = graph.node(PIPE_GUARD_INTERNAL, CPipeAny=CPipeAny, context=context, **guards)
        else:
            editor = graph.node(PIPE_EDIT_INTERNAL, CPipeAny=CPipeAny, context=context, **values)
        editor.set_override_display_id(cls.hidden.unique_id)
        return io.NodeOutput(editor.out(0), expand=graph.finalize())


class CPipeOverrideGuard(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=PIPE_GUARD_INTERNAL,
            category=CATEGORY.MAIN.value + CATEGORY.PIPE.value,
            is_dev_only=True,
            enable_expand=True,
            accept_all_inputs=True,
            inputs=[
                io.AnyType.Input('context'),
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Input(CLASSES.CPIPE_ANY_TYPE.value, optional=True),
            ],
            outputs=[io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Output()],
        )

    @classmethod
    def execute(cls, context: dict, CPipeAny: list[object] | None = None,
                **guards: object) -> io.NodeOutput:
        values = dict(context['values'])
        for name, fields in context['dependencies'].items():
            if any(index >= len(guards[key]) or empty_value(guards[key][index]) for key, index in fields):
                # Keep the slot present, but do not schedule its unavailable
                # override branch. The inherited pipe value remains untouched.
                values[name] = None
        graph = GraphBuilder()
        # Evaluated pipe payloads can resemble links (e.g. ['text', 1]); carry the
        # base inside context so expansion never misinterprets it as a graph edge.
        editor = graph.node(PIPE_EDIT_INTERNAL, context={'layout': context['layout'], 'base': CPipeAny}, **values)
        editor.set_override_display_id(context['display_id'])
        return io.NodeOutput(editor.out(0), expand=graph.finalize())


class CPipeEditInternal(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=PIPE_EDIT_INTERNAL,
            category=CATEGORY.MAIN.value + CATEGORY.PIPE.value,
            is_dev_only=True,
            inputs=[
                io.AnyType.Input('context'),
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Input(CLASSES.CPIPE_ANY_TYPE.value, optional=True),
                *[io.AnyType.Input(f'any_{index}', optional=True) for index in range(1, PIPE_CAPACITY + 1)],
            ],
            outputs=[io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Output()],
        )

    @classmethod
    def execute(cls, context: dict, CPipeAny: list[object] | None = None,
                **values: object) -> io.NodeOutput:
        if 'base' in context:
            CPipeAny = context['base']
        return io.NodeOutput(edit_pipe(CPipeAny, values, context['layout']))


class CPipeFromAny(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CPIPE_FROM_ANY_NAME.value,
            display_name=CLASSES.CPIPE_FROM_ANY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PIPE.value,
            inputs=[io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Input(CLASSES.CPIPE_ANY_TYPE.value)],
            # All output indices must exist in the server schema for prompt validation.
            # The frontend exposes only the active range and retains connected slots.
            outputs=[
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Output(display_name=CLASSES.CPIPE_ANY_TYPE.value),
                *[io.AnyType.Output(display_name=f'any_{index}') for index in range(1, PIPE_CAPACITY + 1)],
            ],
        )

    @classmethod
    def execute(cls, CPipeAny: list[object] | None) -> io.NodeOutput:
        pipe = CPipeAny if CPipeAny is not None else PipeValues([], [])
        if len(pipe) > PIPE_CAPACITY:
            raise ValueError(f'Crystools pipes support up to {PIPE_CAPACITY} values')
        values = list(pipe) + [None] * (PIPE_CAPACITY - len(pipe))
        outputs = [None if empty_value(value) else value for value in values]
        return io.NodeOutput(pipe, *outputs)
