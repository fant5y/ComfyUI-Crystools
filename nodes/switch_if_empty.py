from numbers import Number

from comfy_api.latest import io

from ..core import CATEGORY
from ..core.optional import EMPTY
from ..core.pipe import empty_value
from ._names import CLASSES


class CSwitchAnyIfEmpty(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_ANY_IF_EMPTY_NAME.value,
            display_name=CLASSES.CSWITCH_ANY_IF_EMPTY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            description=('Check value for emptiness and select on_true or on_false. '
                         'Either branch may be disconnected. An empty selected branch '
                         'omits the connected optional input on the receiving node.'),
            inputs=[
                io.AnyType.Input('value', optional=True),
                io.AnyType.Input('on_true', optional=True, lazy=True),
                io.AnyType.Input('on_false', optional=True, lazy=True),
                io.Boolean.Input('zero_is_empty', default=False),
            ],
            outputs=[
                io.AnyType.Output(display_name='any'),
                io.Boolean.Output(display_name='is_empty'),
            ],
        )

    @classmethod
    def _is_empty(cls, value: object, zero_is_empty: bool) -> bool:
        return (value is EMPTY or empty_value(value)
                or (zero_is_empty and isinstance(value, Number) and value == 0))

    @classmethod
    def check_lazy_status(cls, value: object = None, on_true: object = EMPTY,
                          on_false: object = EMPTY, zero_is_empty: bool = False) -> list[str]:
        is_empty = cls._is_empty(value, zero_is_empty)
        selected = on_true if is_empty else on_false
        return ['on_true' if is_empty else 'on_false'] if selected is None else []

    @classmethod
    def execute(cls, value: object = None, on_true: object = EMPTY,
                on_false: object = EMPTY, zero_is_empty: bool = False) -> io.NodeOutput:
        is_empty = bool(cls._is_empty(value, zero_is_empty))
        selected = on_true if is_empty else on_false
        return io.NodeOutput(EMPTY if selected is None else selected, is_empty)
