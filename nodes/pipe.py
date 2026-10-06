from comfy_api.latest import io
from comfy_execution.graph_utils import ExecutionBlocker, GraphBuilder, is_link
from ..core import CATEGORY
from ..core.pipe import PipeValues, empty_value, pipe_layout
from ._names import CLASSES


PIPE_CAPACITY = 100
PIPE_EDIT_INTERNAL = 'Crystools Pipe Edit Internal [Crystools]'


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
        if value is not None:
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
                *[io.AnyType.Input(f'any_{index}', optional=True, raw_link=True)
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

        extracted = {}
        for name, value in values.items():
            if not is_link(value) or value[1] <= 0:
                continue
            source = dynprompt.get_node(value[0])
            if source['class_type'] == CLASSES.CPIPE_FROM_ANY_NAME.value:
                # Read the intact payload instead of depending on an extracted
                # blocker, which ComfyUI propagates before calling this node.
                extracted[name] = int(value[1]) - 1
                values[name] = [value[0], 0]

        graph = GraphBuilder()
        editor = graph.node(
            PIPE_EDIT_INTERNAL, CPipeAny=CPipeAny,
            context={'extracted': extracted, 'layout': descriptions}, **values)
        editor.set_override_display_id(cls.hidden.unique_id)
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
        for name, index in context['extracted'].items():
            source = values[name]
            value = source[index] if index < len(source) else None
            values[name] = None if empty_value(value) else value
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
        outputs = [ExecutionBlocker(None) if empty_value(value) else value for value in values]
        return io.NodeOutput(pipe, *outputs)
