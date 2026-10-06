from comfy_api.latest import io
from ..core import TEXTS, KEYS, CATEGORY, logger
from ._names import CLASSES


class CListAny(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CLIST_ANY_NAME.value,
            display_name=CLASSES.CLIST_ANY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.LIST.value,
            inputs=[
                io.AnyType.Input('any_1', optional=True),
                io.AnyType.Input('any_2', optional=True),
                io.AnyType.Input('any_3', optional=True),
                io.AnyType.Input('any_4', optional=True),
                io.AnyType.Input('any_5', optional=True),
                io.AnyType.Input('any_6', optional=True),
                io.AnyType.Input('any_7', optional=True),
                io.AnyType.Input('any_8', optional=True),
            ],
            outputs=[
                io.AnyType.Output(display_name='any_list', is_output_list=True),
            ],
        )

    @classmethod
    def execute(
        cls,
        any_1: object = None,
        any_2: object = None,
        any_3: object = None,
        any_4: object = None,
        any_5: object = None,
        any_6: object = None,
        any_7: object = None,
        any_8: object = None,
    ) -> io.NodeOutput:
        list_any = []

        if any_1 is not None:
            try:
                list_any.append(any_1)
            except Exception as e:
                logger.warn(e)
        if any_2 is not None:
            try:
                list_any.append(any_2)
            except Exception as e:
                logger.warn(e)
        if any_3 is not None:
            try:
                list_any.append(any_3)
            except Exception as e:
                logger.warn(e)
        if any_4 is not None:
            try:
                list_any.append(any_4)
            except Exception as e:
                logger.warn(e)
        if any_5 is not None:
            try:
                list_any.append(any_5)
            except Exception as e:
                logger.warn(e)
        if any_6 is not None:
            try:
                list_any.append(any_6)
            except Exception as e:
                logger.warn(e)
        if any_7 is not None:
            try:
                list_any.append(any_7)
            except Exception as e:
                logger.warn(e)
        if any_8 is not None:
            try:
                list_any.append(any_8)
            except Exception as e:
                logger.warn(e)

        # yes, double brackets are needed because of the OUTPUT_IS_LIST... ¯\_(ツ)_/¯
        return io.NodeOutput([list_any])


class CListString(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CLIST_STRING_NAME.value,
            display_name=CLASSES.CLIST_STRING_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.LIST.value,
            inputs=[
                io.String.Input('string_1', optional=True, default=''),
                io.String.Input('string_2', optional=True, default=''),
                io.String.Input('string_3', optional=True, default=''),
                io.String.Input('string_4', optional=True, default=''),
                io.String.Input('string_5', optional=True, default=''),
                io.String.Input('string_6', optional=True, default=''),
                io.String.Input('string_7', optional=True, default=''),
                io.String.Input('string_8', optional=True, default=''),
                io.String.Input('delimiter', optional=True, default=' '),
            ],
            outputs=[
                io.String.Output(display_name=TEXTS.CONCAT.value),
                io.Custom(CLASSES.CLIST_STRING_TYPE.value).Output(display_name=KEYS.LIST.value, is_output_list=True),
            ],
        )

    @classmethod
    def execute(
        cls,
        string_1: str | None = None,
        string_2: str | None = None,
        string_3: str | None = None,
        string_4: str | None = None,
        string_5: str | None = None,
        string_6: str | None = None,
        string_7: str | None = None,
        string_8: str | None = None,
        delimiter: str = '',
    ) -> io.NodeOutput:
        list_str = []

        if string_1 is not None and string_1 != "":
            list_str.append(string_1)
        if string_2 is not None and string_2 != "":
            list_str.append(string_2)
        if string_3 is not None and string_3 != "":
            list_str.append(string_3)
        if string_4 is not None and string_4 != "":
            list_str.append(string_4)
        if string_5 is not None and string_5 != "":
            list_str.append(string_5)
        if string_6 is not None and string_6 != "":
            list_str.append(string_6)
        if string_7 is not None and string_7 != "":
            list_str.append(string_7)
        if string_8 is not None and string_8 != "":
            list_str.append(string_8)

        return io.NodeOutput(delimiter.join(list_str), [list_str])
