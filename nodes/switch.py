from comfy_api.latest import io
from ._names import CLASSES
from ..core import CATEGORY, logger


class CSwitchFromAny(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_FROM_ANY_NAME.value,
            display_name=CLASSES.CSWITCH_FROM_ANY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            inputs=[
                io.AnyType.Input('any'),
                io.Boolean.Input('boolean', default=True),
            ],
            outputs=[
                io.AnyType.Output(display_name='on_true'),
                io.AnyType.Output(display_name='on_false'),
            ],
        )

    @classmethod
    def execute(cls, any: object, boolean: bool = True) -> io.NodeOutput:
        logger.debug("Any switch: " + str(boolean))

        if boolean:
            return io.NodeOutput(any, None)
        else:
            return io.NodeOutput(None, any)

class CSwitchBooleanAny(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_ANY_NAME.value,
            display_name=CLASSES.CSWITCH_ANY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            inputs=[
                io.AnyType.Input('on_true', lazy=True),
                io.AnyType.Input('on_false', lazy=True),
                io.Boolean.Input('boolean', default=True),
            ],
            outputs=[
                io.AnyType.Output(),
            ],
        )

    @classmethod
    def check_lazy_status(
        cls,
        on_true: object = None,
        on_false: object = None,
        boolean: bool = True,
    ) -> list[str]:
        needed = "on_true" if boolean else "on_false"
        return [needed] if (on_true if boolean else on_false) is None else []

    @classmethod
    def execute(cls, on_true: object = None, on_false: object = None, boolean: bool = True) -> io.NodeOutput:
        logger.debug("Any switch: " + str(boolean))

        if boolean:
            return io.NodeOutput(on_true)
        else:
            return io.NodeOutput(on_false)


class CSwitchBooleanString(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_STRING_NAME.value,
            display_name=CLASSES.CSWITCH_STRING_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            inputs=[
                io.String.Input('on_true', default='', lazy=True),
                io.String.Input('on_false', default='', lazy=True),
                io.Boolean.Input('boolean', default=True),
            ],
            outputs=[
                io.String.Output(display_name='string'),
            ],
        )

    @classmethod
    def check_lazy_status(
        cls,
        on_true: str | None = None,
        on_false: str | None = None,
        boolean: bool = True,
    ) -> list[str]:
        needed = "on_true" if boolean else "on_false"
        return [needed] if (on_true if boolean else on_false) is None else []

    @classmethod
    def execute(
        cls,
        on_true: str | None = None,
        on_false: str | None = None,
        boolean: bool = True,
    ) -> io.NodeOutput:
        logger.debug("String switch: " + str(boolean))

        if boolean:
            return io.NodeOutput(on_true)
        else:
            return io.NodeOutput(on_false)


class CSwitchBooleanConditioning(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_CONDITIONING_NAME.value,
            display_name=CLASSES.CSWITCH_CONDITIONING_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            inputs=[
                io.Conditioning.Input('on_true', lazy=True),
                io.Conditioning.Input('on_false', lazy=True),
                io.Boolean.Input('boolean', default=True),
            ],
            outputs=[
                io.Conditioning.Output(display_name='conditioning'),
            ],
        )

    @classmethod
    def check_lazy_status(
        cls,
        on_true: io.Conditioning.Type | None = None,
        on_false: io.Conditioning.Type | None = None,
        boolean: bool = True,
    ) -> list[str]:
        needed = "on_true" if boolean else "on_false"
        return [needed] if (on_true if boolean else on_false) is None else []

    @classmethod
    def execute(
        cls,
        on_true: io.Conditioning.Type | None = None,
        on_false: io.Conditioning.Type | None = None,
        boolean: bool = True,
    ) -> io.NodeOutput:
        logger.debug("Conditioning switch: " + str(boolean))

        if boolean:
            return io.NodeOutput(on_true)
        else:
            return io.NodeOutput(on_false)


class CSwitchBooleanImage(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_IMAGE_NAME.value,
            display_name=CLASSES.CSWITCH_IMAGE_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            inputs=[
                io.Image.Input('on_true', lazy=True),
                io.Image.Input('on_false', lazy=True),
                io.Boolean.Input('boolean', default=True),
            ],
            outputs=[
                io.Image.Output(display_name='image'),
            ],
        )

    @classmethod
    def check_lazy_status(
        cls,
        on_true: io.Image.Type | None = None,
        on_false: io.Image.Type | None = None,
        boolean: bool = True,
    ) -> list[str]:
        needed = "on_true" if boolean else "on_false"
        return [needed] if (on_true if boolean else on_false) is None else []

    @classmethod
    def execute(
        cls,
        on_true: io.Image.Type | None = None,
        on_false: io.Image.Type | None = None,
        boolean: bool = True,
    ) -> io.NodeOutput:
        logger.debug("Image switch: " + str(boolean))

        if boolean:
            return io.NodeOutput(on_true)
        else:
            return io.NodeOutput(on_false)


class CSwitchBooleanLatent(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_LATENT_NAME.value,
            display_name=CLASSES.CSWITCH_LATENT_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            inputs=[
                io.Latent.Input('on_true', lazy=True),
                io.Latent.Input('on_false', lazy=True),
                io.Boolean.Input('boolean', default=True),
            ],
            outputs=[
                io.Latent.Output(display_name='latent'),
            ],
        )

    @classmethod
    def check_lazy_status(
        cls,
        on_true: io.Latent.Type | None = None,
        on_false: io.Latent.Type | None = None,
        boolean: bool = True,
    ) -> list[str]:
        needed = "on_true" if boolean else "on_false"
        return [needed] if (on_true if boolean else on_false) is None else []

    @classmethod
    def execute(
        cls,
        on_true: io.Latent.Type | None = None,
        on_false: io.Latent.Type | None = None,
        boolean: bool = True,
    ) -> io.NodeOutput:
        logger.debug("Latent switch: " + str(boolean))

        if boolean:
            return io.NodeOutput(on_true)
        else:
            return io.NodeOutput(on_false)


class CSwitchBooleanMask(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CSWITCH_MASK_NAME.value,
            display_name=CLASSES.CSWITCH_MASK_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.SWITCH.value,
            inputs=[
                io.Mask.Input('on_true', lazy=True),
                io.Mask.Input('on_false', lazy=True),
                io.Boolean.Input('boolean', default=True),
            ],
            outputs=[
                io.Mask.Output(display_name='mask'),
            ],
        )

    @classmethod
    def check_lazy_status(
        cls,
        on_true: io.Mask.Type | None = None,
        on_false: io.Mask.Type | None = None,
        boolean: bool = True,
    ) -> list[str]:
        needed = "on_true" if boolean else "on_false"
        return [needed] if (on_true if boolean else on_false) is None else []

    @classmethod
    def execute(
        cls,
        on_true: io.Mask.Type | None = None,
        on_false: io.Mask.Type | None = None,
        boolean: bool = True,
    ) -> io.NodeOutput:
        logger.debug("Mask switch: " + str(boolean))

        if boolean:
            return io.NodeOutput(on_true)
        else:
            return io.NodeOutput(on_false)
