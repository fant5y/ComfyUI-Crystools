from numbers import Number

from comfy_api.latest import io
from comfy_execution.graph_utils import ExecutionBlocker

from ..core import CATEGORY
from ..core.optional import BYPASS_ALLOWED, EMPTY
from ..core.pipe import empty_value
from ._names import CLASSES


class CSwitchAnyIfEmpty(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_ANY_IF_EMPTY_NAME.value,
            display_name=CLASSES.CSWITCH_ANY_IF_EMPTY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            description=(
                "Check value for emptiness and select on_true or on_false. "
                "Either branch may be disconnected. An empty selected branch "
                "either omits an optional argument or bypasses directly connected nodes during the same run."
            ),
            inputs=[
                io.AnyType.Input(
                    "value",
                    optional=True,
                    tooltip="False and empty values select on_true. True selects on_false.",
                ),
                io.AnyType.Input("on_true", optional=True, lazy=True),
                io.AnyType.Input("on_false", optional=True, lazy=True),
                io.Boolean.Input("zero_is_empty", default=False),
                io.Combo.Input(
                    "empty_action",
                    options=["omit", "bypass"],
                    default="omit",
                    tooltip="omit: use the optional input default. bypass: set nodes connected to any to native purple bypass when the selected branch is empty.",
                ),
            ],
            outputs=[
                io.AnyType.Output(display_name="any"),
                io.Boolean.Output(display_name="is_empty"),
            ],
        )

    @classmethod
    def _is_empty(cls, value: object, zero_is_empty: bool) -> bool:
        return (
            value is EMPTY
            or empty_value(value)
            or value is False
            or (zero_is_empty and isinstance(value, Number) and value == 0)
        )

    @classmethod
    def check_lazy_status(
        cls,
        value: object = None,
        on_true: object = EMPTY,
        on_false: object = EMPTY,
        zero_is_empty: bool = False,
        empty_action: str = "omit",
    ) -> list[str]:
        is_empty = cls._is_empty(value, zero_is_empty)
        selected = on_true if is_empty else on_false
        return ["on_true" if is_empty else "on_false"] if selected is None else []

    @classmethod
    def execute(
        cls,
        value: object = None,
        on_true: object = EMPTY,
        on_false: object = EMPTY,
        zero_is_empty: bool = False,
        empty_action: str = "omit",
    ) -> io.NodeOutput:
        is_empty = bool(cls._is_empty(value, zero_is_empty))
        selected = on_true if is_empty else on_false
        if selected is None or selected is EMPTY:
            selected = EMPTY
        return io.NodeOutput(selected, is_empty)


class CEmptyBypassDecision(io.ComfyNode):
    """Read the selected branch once within the submitted workflow."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="CRYSTOOLS_EMPTY_BYPASS_DECISION",
            is_dev_only=True,
            is_input_list=True,
            has_intermediate_output=True,
            inputs=[io.AnyType.Input("value", optional=True)],
            outputs=[io.Boolean.Output()],
        )

    @classmethod
    def execute(cls, value: list[object] | None = None) -> io.NodeOutput:
        bypass = value is None or not value or all(item is EMPTY for item in value)
        return io.NodeOutput(bypass, ui={"crystools_empty_branch": [bypass]})


class CEmptyBypassRoute(io.ComfyNode):
    """Let native lazy evaluation request only the selected connection."""

    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id="CRYSTOOLS_EMPTY_BYPASS_ROUTE",
            is_dev_only=True,
            is_input_list=True,
            inputs=[
                io.Boolean.Input("block", default=False),
                io.Boolean.Input("has_passthrough", default=False),
                io.Boolean.Input("guard", default=False),
                *[
                    io.Boolean.Input(
                        f"condition_{index}", optional=True, force_input=True
                    )
                    for index in range(100)
                ],
                io.AnyType.Input("normal", optional=True, lazy=True),
                io.AnyType.Input("passthrough", optional=True, lazy=True),
            ],
            outputs=[io.AnyType.Output(is_output_list=True)],
        )

    @classmethod
    def check_lazy_status(
        cls,
        block: list[bool],
        has_passthrough: list[bool],
        guard: list[bool],
        normal: list[object] | None = None,
        passthrough: list[object] | None = None,
        **conditions: list[bool],
    ) -> list[str]:
        bypass = any(state for stream in conditions.values() for state in stream)
        if guard[0]:
            return []
        if bypass and (block[0] or not has_passthrough[0]):
            return []
        selected = passthrough if bypass else normal
        unresolved = selected is None or (
            isinstance(selected, tuple) and len(selected) == 1 and selected[0] is None
        )
        return ["passthrough" if bypass else "normal"] if unresolved else []

    @classmethod
    def execute(
        cls,
        block: list[bool],
        has_passthrough: list[bool],
        guard: list[bool],
        normal: list[object] | None = None,
        passthrough: list[object] | None = None,
        **conditions: list[bool],
    ) -> io.NodeOutput:
        bypass = any(state for stream in conditions.values() for state in stream)
        if guard[0]:
            return io.NodeOutput([ExecutionBlocker(None) if bypass else BYPASS_ALLOWED])
        if bypass and block[0]:
            # This blocker stays at the receiver; its consumers use passthrough routes.
            return io.NodeOutput([ExecutionBlocker(None)])
        selected = passthrough if bypass else normal
        return io.NodeOutput([EMPTY] if selected is None else selected)
