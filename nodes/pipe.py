from comfy_api.latest import io
from ..core import CATEGORY
from ._names import CLASSES


class CPipeToAny(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CPIPE_TO_ANY_NAME.value,
            display_name=CLASSES.CPIPE_TO_ANY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PIPE.value,
            inputs=[
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Input(CLASSES.CPIPE_ANY_TYPE.value, optional=True),
                io.AnyType.Input('any_1', optional=True),
                io.AnyType.Input('any_2', optional=True),
                io.AnyType.Input('any_3', optional=True),
                io.AnyType.Input('any_4', optional=True),
                io.AnyType.Input('any_5', optional=True),
                io.AnyType.Input('any_6', optional=True),
            ],
            outputs=[
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Output(),
            ],
        )

    @classmethod
    def execute(
        cls,
        CPipeAny: object = None,
        any_1: object = None,
        any_2: object = None,
        any_3: object = None,
        any_4: object = None,
        any_5: object = None,
        any_6: object = None,
    ) -> io.NodeOutput:
        any_1_original = None
        any_2_original = None
        any_3_original = None
        any_4_original = None
        any_5_original = None
        any_6_original = None

        if CPipeAny != None:
            any_1_original, any_2_original, any_3_original, any_4_original, any_5_original, any_6_original = CPipeAny

        CAnyPipeMod = []

        CAnyPipeMod.append(any_1 if any_1 is not None else any_1_original)
        CAnyPipeMod.append(any_2 if any_2 is not None else any_2_original)
        CAnyPipeMod.append(any_3 if any_3 is not None else any_3_original)
        CAnyPipeMod.append(any_4 if any_4 is not None else any_4_original)
        CAnyPipeMod.append(any_5 if any_5 is not None else any_5_original)
        CAnyPipeMod.append(any_6 if any_6 is not None else any_6_original)

        return io.NodeOutput(CAnyPipeMod)


class CPipeFromAny(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CPIPE_FROM_ANY_NAME.value,
            display_name=CLASSES.CPIPE_FROM_ANY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.PIPE.value,
            inputs=[
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Input(CLASSES.CPIPE_ANY_TYPE.value),
            ],
            outputs=[
                io.Custom(CLASSES.CPIPE_ANY_TYPE.value).Output(display_name=CLASSES.CPIPE_ANY_TYPE.value),
                io.AnyType.Output(display_name='any_1'),
                io.AnyType.Output(display_name='any_2'),
                io.AnyType.Output(display_name='any_3'),
                io.AnyType.Output(display_name='any_4'),
                io.AnyType.Output(display_name='any_5'),
                io.AnyType.Output(display_name='any_6'),
            ],
        )

    @classmethod
    def execute(cls, CPipeAny: object = None) -> io.NodeOutput:
        any_1, any_2, any_3, any_4, any_5, any_6 = CPipeAny
        return io.NodeOutput(CPipeAny, any_1, any_2, any_3, any_4, any_5, any_6)
