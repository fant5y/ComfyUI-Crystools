from comfy_api.latest import io
from ._names import CLASSES
from ..core import CATEGORY, findJsonStrDiff, get_system_stats, logger


class CUtilsCompareJsons(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CUTILS_JSON_COMPARATOR_NAME.value,
            display_name=CLASSES.CUTILS_JSON_COMPARATOR_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.UTILS.value,
            inputs=[
                io.Custom('JSON').Input('json_old'),
                io.Custom('JSON').Input('json_new'),
            ],
            outputs=[
                io.Custom('JSON').Output(display_name='json_compared'),
            ],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, json_old: object, json_new: object) -> io.NodeOutput:
        json = findJsonStrDiff(json_old, json_new)
        return io.NodeOutput(str(json))


# Credits to: https://github.com/WASasquatch/was-node-suite-comfyui for the following node!
class CUtilsStatSystem(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CUTILS_STAT_SYSTEM_NAME.value,
            display_name=CLASSES.CUTILS_STAT_SYSTEM_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.UTILS.value,
            inputs=[
                io.Latent.Input('latent'),
            ],
            outputs=[
                io.Latent.Output(display_name='latent'),
            ],
        )

    @classmethod
    def execute(cls, latent: io.Latent.Type) -> io.NodeOutput:
        log = "Samples Passthrough:\n"
        for stat in get_system_stats():
            log += stat + "\n"

        logger.debug(log)

        return io.NodeOutput.from_dict({'ui': {'text': [log]}, 'result': (latent,)})
