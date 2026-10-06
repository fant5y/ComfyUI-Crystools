import sys

from comfy_api.latest import io
from ._names import CLASSES
from ..core import CATEGORY


class CBoolean(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CBOOLEAN_NAME.value,
            display_name=CLASSES.CBOOLEAN_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PRIMITIVE.value,
            inputs=[
                io.Boolean.Input('boolean', default=True),
            ],
            outputs=[
                io.Boolean.Output(display_name='boolean'),
            ],
        )

    @classmethod
    def execute(cls, boolean: bool = True) -> io.NodeOutput:
        return io.NodeOutput(boolean)


class CText(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CTEXT_NAME.value,
            display_name=CLASSES.CTEXT_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PRIMITIVE.value,
            inputs=[
                io.String.Input('string', default=''),
            ],
            outputs=[
                io.String.Output(display_name='string'),
            ],
        )

    @classmethod
    def execute(cls, string: str = '') -> io.NodeOutput:
        return io.NodeOutput(string)


class CTextML(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CTEXTML_NAME.value,
            display_name=CLASSES.CTEXTML_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PRIMITIVE.value,
            inputs=[
                io.String.Input('string', multiline=True, default=''),
            ],
            outputs=[
                io.String.Output(display_name='string'),
            ],
        )

    @classmethod
    def execute(cls, string: str = '') -> io.NodeOutput:
        return io.NodeOutput(string)


class CInteger(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CINTEGER_NAME.value,
            display_name=CLASSES.CINTEGER_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PRIMITIVE.value,
            inputs=[
                io.Int.Input('int', default=1, min=-sys.maxsize, max=sys.maxsize, step=1),
            ],
            outputs=[
                io.Int.Output(display_name='int'),
            ],
        )

    @classmethod
    def execute(cls, int: int = True) -> io.NodeOutput:
        return io.NodeOutput(int)


class CFloat(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CFLOAT_NAME.value,
            display_name=CLASSES.CFLOAT_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PRIMITIVE.value,
            inputs=[
                io.Float.Input('float', default=1, min=-sys.float_info.max, max=sys.float_info.max, step=0.01),
            ],
            outputs=[
                io.Float.Output(display_name='float'),
            ],
        )

    @classmethod
    def execute(cls, float: float = True) -> io.NodeOutput:
        return io.NodeOutput(float)
