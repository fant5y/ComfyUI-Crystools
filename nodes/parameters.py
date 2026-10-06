from comfy_api.latest import io
from ._names import CLASSES
import json
from ..core import CONFIG, CATEGORY, logger, get_nested_value

# class CParameter:
#     def __init__(self):
#         pass
#
#     @classmethod
#     def INPUT_TYPES(cls):
#         return {
#             "required": {
#             },
#             "optional": {
#               "path_to_json": STRING,
#               "key": STRING,
#               "default": STRING,
#             },
#         }
#
#     CATEGORY = CATEGORY.MAIN.value + CATEGORY.UTILS.value
#     INPUT_IS_LIST = False
#
#     RETURN_TYPES = (any,)
#     RETURN_NAMES = ("any",)
#
#     FUNCTION = "execute"
#
#     def execute(self, path_to_json=None, key=True, default=None):
#         text = default
#         value = text
#
#         if path_to_json is not None and path_to_json != "":
#           logger.debug(f"External parameter from: '{path_to_json}'")
#           try:
#             with open(path_to_json, 'r') as file:
#               data = json.load(file)
#               logger.debug(f"File found, data: '{data}'")
#
#               result = get_value(data, key, default)
#               text = result["text"]
#               value = result["value"]
#
#           except Exception as e:
#             logger.error(e)
#             text = f"Error reading file: {e}\nReturning default value: '{default}'"
#             value = default
#
#         return {"ui": {"text": [text]}, "result": [value]}

class CJsonFile(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CJSONFILE_NAME.value,
            display_name=CLASSES.CJSONFILE_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.UTILS.value,
            inputs=[
                io.String.Input('path_to_json', optional=True, default=''),
            ],
            outputs=[
                io.Custom('JSON').Output(display_name='json'),
            ],
            is_input_list=False,
        )

    @classmethod
    def fingerprint_inputs(cls, path_to_json: str | None = None) -> str | float:
        return float("nan")

    @classmethod
    def execute(cls, path_to_json: str | None = None) -> io.NodeOutput:
        text = ""
        data = {}

        if path_to_json is not None and path_to_json != "":
          logger.debug(f"Open json file: '{path_to_json}'")
          try:
            with open(path_to_json, 'r') as file:
              data = json.load(file)
              text = json.dumps(data, indent=CONFIG["indent"])
              logger.debug(f"File found, data: '{str(data)}'")

          except Exception as e:
            logger.error(e)
            text = f"Error reading file: {e}"

        return io.NodeOutput.from_dict({'ui': {'text': [text]}, 'result': [data]})

class CJsonExtractor(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CJSONEXTRACTOR_NAME.value,
            display_name=CLASSES.CJSONEXTRACTOR_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.UTILS.value,
            inputs=[
                io.Custom('JSON').Input('json'),
                io.String.Input('key', optional=True, default=''),
                io.String.Input('default', optional=True, default=''),
            ],
            outputs=[
                io.AnyType.Output(display_name='any'),
                io.String.Output(display_name='string'),
                io.Int.Output(display_name='int'),
                io.Float.Output(display_name='float'),
                io.Boolean.Output(display_name='boolean'),
            ],
            is_input_list=False,
        )

    @classmethod
    def execute(cls, json: object = None, key: str = True, default: str | None = None) -> io.NodeOutput:
        result = get_value(json, key, default)

        result["any"] = result["value"]
        try:
          result["string"] = str(result["value"])
        except Exception as e:
          result["string"] = result["value"]

        try:
          result["int"] = int(result["value"])
        except Exception as e:
          result["int"] = result["value"]

        try:
          result["float"] = float(result["value"])
        except Exception as e:
          result["float"] = result["value"]

        try:
          result["boolean"] = result["value"].lower() == "true"
        except Exception as e:
          result["boolean"] = result["value"]

        return io.NodeOutput.from_dict({'ui': {'text': [result['text']]}, 'result': [result['any'], result['string'], result['int'], result['float'], result['boolean']]})

def get_value(data, key, default=None):
  text = ""
  val = ""

  if key is not None and key != "":
    val = get_nested_value(data, key, default)
    if default != val:
      text = f"Key found, return value: '{val}'"
    else:
      text = f"Key no found, return default value: '{val}'"
  else:
    text = f"Key is empty, return default value: '{val}'"

  return {
    "text": text,
    "value": val
  }
