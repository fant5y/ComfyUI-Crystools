from comfy_api.latest import io
from ._names import CLASSES
import json
from ..core import CONFIG, CATEGORY, KEYS, TEXTS, logger

class CConsoleAny(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CDEBUGGER_CONSOLE_ANY_NAME.value,
            display_name=CLASSES.CDEBUGGER_ANY_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.DEBUGGER.value,
            inputs=[
                io.AnyType.Input('any_value', optional=True),
                io.Boolean.Input('console', optional=True, default=False),
                io.Boolean.Input('display', optional=True, default=True),
                io.String.Input(KEYS.PREFIX.value, optional=True, default=''),
            ],
            outputs=[
            ],
            is_input_list=True,
            is_output_node=True,
        )

    @classmethod
    def execute(
        cls,
        any_value: list[object] | None = None,
        console: list[bool] | None = None,
        display: list[bool] | None = None,
        prefix: list[str] | None = None,
    ) -> io.NodeOutput:
        console = console[0] if console else False
        display = display[0] if display else True
        prefix = prefix[0] if prefix else ""
        text = ""
        textToDisplay = TEXTS.INACTIVE_MSG.value

        if any_value is not None:
            try:
                if type(any_value) == list:
                    for item in any_value:
                        try:
                            text += str(item)
                        except Exception as e:
                            text += "source exists, but could not be serialized.\n"
                            logger.warn(e)
                else:
                    logger.warn("any_value is not a list")

            except Exception:
                try:
                    text = json.dumps(any_value)[1:-1]
                except Exception:
                    text = 'source exists, but could not be serialized.'

        logger.debug(f"Show any to console is running...")

        if console:
            if prefix is not None and prefix != "":
                print(f"{prefix}: {text}")
            else:
                print(text)

        if display:
            textToDisplay = text

        value = [console, display, prefix, textToDisplay]
        # setWidgetValues(value, unique_id, extra_pnginfo)

        return io.NodeOutput.from_dict({'ui': {'text': value}})


class CConsoleAnyToJson(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CDEBUGGER_CONSOLE_ANY_TO_JSON_NAME.value,
            display_name=CLASSES.CDEBUGGER_CONSOLE_ANY_TO_JSON_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.DEBUGGER.value,
            inputs=[
                io.AnyType.Input('any_value', optional=True),
            ],
            outputs=[
                io.String.Output(display_name='string'),
            ],
            is_input_list=True,
            is_output_node=True,
        )

    @classmethod
    def execute(cls, any_value: list[object] | None = None) -> io.NodeOutput:
        text = TEXTS.INACTIVE_MSG.value

        if any_value is not None and isinstance(any_value, list):
            item = any_value[0]

            if isinstance(item, dict):
                try:
                    text = json.dumps(item, indent=CONFIG["indent"])
                except Exception as e:
                    text = "The input is a dict, but could not be serialized.\n"
                    logger.warn(e)

            elif isinstance(item, list):
                try:
                    text = json.dumps(item, indent=CONFIG["indent"])
                except Exception as e:
                    text = "The input is a list, but could not be serialized.\n"
                    logger.warn(e)

            else:
                text = str(item)

        logger.debug(f"Show any-json to console is running...")

        return io.NodeOutput.from_dict({'ui': {'text': [text]}, 'result': (text,)})
