from comfy_api.latest import io

from ..core import CATEGORY
from ._names import CLASSES


class CPassAny(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        value_type = io.MatchType.Template('value')
        return io.Schema(
            node_id=CLASSES.CPASS_ANY_NAME.value,
            display_name=CLASSES.CPASS_ANY_DESC.value,
            category=CATEGORY.MAIN.value,
            description='Pass any connected value through unchanged.',
            inputs=[io.MatchType.Input('value', template=value_type)],
            outputs=[io.MatchType.Output(template=value_type, display_name='value')],
        )

    @classmethod
    def execute(cls, value: object) -> io.NodeOutput:
        return io.NodeOutput(value)
