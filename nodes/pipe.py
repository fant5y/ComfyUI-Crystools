from comfy_api.latest import io
from ..core import CATEGORY
from ..core.pipe import PipeValues, pipe_layout
from ._names import CLASSES


PIPE_CAPACITY = 100


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
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Input(CLASSES.CPIPE_ANY_TYPE.value, optional=True),
                *[io.AnyType.Input(f'any_{index}', optional=True) for index in range(1, PIPE_CAPACITY + 1)],
            ],
            outputs=[io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Output()],
            hidden=[io.Hidden.unique_id, io.Hidden.extra_pnginfo],
        )

    @classmethod
    def execute(cls, CPipeAny: list[object] | None = None, **values: object) -> io.NodeOutput:
        pipe = list(CPipeAny) if CPipeAny is not None else []
        supplied_slots = [int(name[4:]) for name in values if name.startswith('any_')]
        length = max(6, len(pipe), max(supplied_slots, default=0))
        if length > PIPE_CAPACITY:
            raise ValueError(f'Crystools pipes support up to {PIPE_CAPACITY} values')
        pipe.extend([None] * (length - len(pipe)))
        inherited = getattr(CPipeAny, 'layout', [])
        layout = list(inherited) + [None] * max(0, length - len(inherited))
        descriptions = pipe_layout(cls.hidden)
        for index in range(length):
            value = values.get(f'any_{index + 1}')
            if value is not None:
                pipe[index] = value
                layout[index] = descriptions[index] if index < len(descriptions) else None
        return io.NodeOutput(PipeValues(pipe, layout))


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
    def execute(cls, CPipeAny: list[object]) -> io.NodeOutput:
        if len(CPipeAny) > PIPE_CAPACITY:
            raise ValueError(f'Crystools pipes support up to {PIPE_CAPACITY} values')
        values = list(CPipeAny) + [None] * (PIPE_CAPACITY - len(CPipeAny))
        return io.NodeOutput(CPipeAny, *values)
