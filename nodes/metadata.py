from comfy_api.latest import io
from ._names import CLASSES
import json
import re
from ..core import CATEGORY, CONFIG, TEXTS, findJsonsDiff, logger


class CMetadataExtractor(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CMETADATA_EXTRACTOR_NAME.value,
            display_name=CLASSES.CMETADATA_EXTRACTOR_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.METADATA.value,
            inputs=[
                io.Custom('METADATA_RAW').Input('metadata_raw'),
            ],
            outputs=[
                io.Custom('JSON').Output(display_name='prompt'),
                io.Custom('JSON').Output(display_name='workflow'),
                io.Custom('JSON').Output(display_name='file info'),
                io.Custom('JSON').Output(display_name='raw to JSON'),
                io.String.Output(display_name='raw to property'),
                io.String.Output(display_name='raw to csv'),
            ],
        )

    @classmethod
    def execute(cls, metadata_raw: object = None) -> io.NodeOutput:
        prompt = {}
        workflow = {}
        fileinfo = {}
        text = ""
        csv = ""

        if metadata_raw is not None and isinstance(metadata_raw, dict):
            try:
                for key, value in metadata_raw.items():

                    if isinstance(value, dict):
                        # yes, double json.dumps is needed for jsons
                        value = json.dumps(json.dumps(value))
                    else:
                        value = json.dumps(value)

                    text += f"\"{key}\"={value}\n"
                    # remove spaces
                    # value = re.sub(' +', ' ', value)
                    value = re.sub('\n', ' ', value)
                    csv += f'"{key}"\t{value}\n'

                if csv != "":
                    csv = '"key"\t"value"\n' + csv

            except Exception as e:
                logger.warn(e)

            try:
                if "prompt" in metadata_raw:
                    prompt = metadata_raw["prompt"]
                else:
                    raise Exception("Prompt not found in metadata_raw")
            except Exception as e:
                logger.warn(e)

            try:
                if "workflow" in metadata_raw:
                    workflow = metadata_raw["workflow"]
                else:
                    raise Exception("Workflow not found in metadata_raw")
            except Exception as e:
                logger.warn(e)

            try:
                if "fileinfo" in metadata_raw:
                    fileinfo = metadata_raw["fileinfo"]
                else:
                    raise Exception("Fileinfo not found in metadata_raw")
            except Exception as e:
                logger.warn(e)

        elif metadata_raw is None:
            logger.debug("metadata_raw is None")
        else:
            logger.warn(TEXTS.INVALID_METADATA_MSG.value)

        return io.NodeOutput(json.dumps(prompt, indent=CONFIG['indent']), json.dumps(workflow, indent=CONFIG['indent']), json.dumps(fileinfo, indent=CONFIG['indent']), json.dumps(metadata_raw, indent=CONFIG['indent']), text, csv)


class CMetadataCompare(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CMETADATA_COMPARATOR_NAME.value,
            display_name=CLASSES.CMETADATA_COMPARATOR_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.METADATA.value,
            inputs=[
                io.Custom('METADATA_RAW').Input('metadata_raw_old'),
                io.Custom('METADATA_RAW').Input('metadata_raw_new'),
                io.Combo.Input('what', options=['Prompt', 'Workflow', 'Fileinfo']),
            ],
            outputs=[
                io.Custom('JSON').Output(display_name='diff'),
            ],
            is_output_node=True,
        )

    @classmethod
    def execute(
        cls,
        what: str,
        metadata_raw_old: object = None,
        metadata_raw_new: object = None,
    ) -> io.NodeOutput:
        prompt_old = {}
        workflow_old = {}
        fileinfo_old = {}
        prompt_new = {}
        workflow_new = {}
        fileinfo_new = {}
        diff = ""

        if type(metadata_raw_old) == dict and type(metadata_raw_new) == dict:

            if "prompt" in metadata_raw_old:
                prompt_old = metadata_raw_old["prompt"]
            else:
                logger.warn("Prompt not found in metadata_raw_old")

            if "workflow" in metadata_raw_old:
                workflow_old = metadata_raw_old["workflow"]
            else:
                logger.warn("Workflow not found in metadata_raw_old")

            if "fileinfo" in metadata_raw_old:
                fileinfo_old = metadata_raw_old["fileinfo"]
            else:
                logger.warn("Fileinfo not found in metadata_raw_old")

            if "prompt" in metadata_raw_new:
                prompt_new = metadata_raw_new["prompt"]
            else:
                logger.warn("Prompt not found in metadata_raw_new")

            if "workflow" in metadata_raw_new:
                workflow_new = metadata_raw_new["workflow"]
            else:
                logger.warn("Workflow not found in metadata_raw_new")

            if "fileinfo" in metadata_raw_new:
                fileinfo_new = metadata_raw_new["fileinfo"]
            else:
                logger.warn("Fileinfo not found in metadata_raw_new")

            if what == "Prompt":
                diff = findJsonsDiff(prompt_old, prompt_new)
            elif what == "Workflow":
                diff = findJsonsDiff(workflow_old, workflow_new)
            else:
                diff = findJsonsDiff(fileinfo_old, fileinfo_new)

            diff = json.dumps(diff, indent=CONFIG["indent"])

        else:
            invalid_msg = TEXTS.INVALID_METADATA_MSG.value
            logger.warn(invalid_msg)
            diff = invalid_msg

        return io.NodeOutput.from_dict({'ui': {'text': [diff]}, 'result': (diff,)})
