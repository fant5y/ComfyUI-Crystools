from ..core.preview import get_preview_state
from comfy_api.latest import io
from ._names import CLASSES
import fnmatch
import os
import json
import piexif
import hashlib
from datetime import datetime
import torch
import numpy as np
from pathlib import Path
from PIL import Image, ImageOps
from PIL.ExifTags import TAGS, GPSTAGS, IFD
from PIL.PngImagePlugin import PngImageFile
from PIL.JpegImagePlugin import JpegImageFile
from nodes import PreviewImage, SaveImage
import folder_paths

from ..core import CATEGORY, CONFIG, TEXTS, setWidgetValues, logger, getResolutionByTensor, get_size



class CImagePreviewFromImage(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CIMAGE_PREVIEW_IMAGE_NAME.value,
            display_name=CLASSES.CIMAGE_PREVIEW_IMAGE_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.IMAGE.value,
            inputs=[
                io.Image.Input('image', optional=True),
            ],
            outputs=[
                io.Custom('METADATA_RAW').Output(display_name='Metadata RAW'),
            ],
            hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo, io.Hidden.unique_id],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, image: io.Image.Type | None = None) -> io.NodeOutput:
        prompt = cls.hidden.prompt
        extra_pnginfo = cls.hidden.extra_pnginfo
        state = get_preview_state("CImagePreviewFromImage", cls.hidden.unique_id)
        saver = PreviewImage()
        text = ""
        title = ""
        data = {
            "result": [''],
            "ui": {
                "text": [''],
                "images": [],
            }
        }

        if image is not None:
            saved = saver.save_images(image, "crystools/i", prompt, extra_pnginfo)
            image = saved["ui"]["images"][0]
            image_path = Path(saver.output_dir).joinpath(image["subfolder"], image["filename"])

            img, promptFromImage, metadata = buildMetadata(image_path)

            images = [image]
            result = metadata

            data["result"] = [result]
            data["ui"]["images"] = images

            title = "Source: Image link \n"
            text += buildPreviewText(metadata)
            text += f"Current prompt (NO FROM IMAGE!):\n"
            text += json.dumps(promptFromImage, indent=CONFIG["indent"])

            state["text"] = text
            state["data"] = data

        elif image is None and state["data"] is not None:
            title = "Source: Image link - CACHED\n"
            data = state["data"]
            text = state["text"]

        else:
            logger.debug("Source: Empty on CImagePreviewFromImage")
            text = "Source: Empty"

        data['ui']['text'] = [title + text]
        return io.NodeOutput.from_dict(data)


class CImagePreviewFromMetadata(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CIMAGE_PREVIEW_METADATA_NAME.value,
            display_name=CLASSES.CIMAGE_PREVIEW_METADATA_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.IMAGE.value,
            inputs=[
                io.Custom('METADATA_RAW').Input('metadata_raw', optional=True),
            ],
            outputs=[
                io.Custom('METADATA_RAW').Output(display_name='Metadata RAW'),
            ],
            hidden=[io.Hidden.unique_id],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, metadata_raw: object = None) -> io.NodeOutput:
        state = get_preview_state("CImagePreviewFromMetadata", cls.hidden.unique_id)
        text = ""
        title = ""
        data = {
            "result": [''],
            "ui": {
                "text": [''],
                "images": [],
            }
        }

        if metadata_raw is not None and metadata_raw != '':
            promptFromImage = {}
            if "prompt" in metadata_raw:
              promptFromImage = metadata_raw["prompt"]

            title = "Source: Metadata RAW\n"
            text += buildPreviewText(metadata_raw)
            text += f"Prompt from image:\n"
            text += json.dumps(promptFromImage, indent=CONFIG["indent"])

            images = cls.resolveImage(metadata_raw["fileinfo"]["filename"])
            result = metadata_raw

            data["result"] = [result]
            data["ui"]["images"] = images

            state["text"] = text
            state["data"] = data

        elif metadata_raw is None and state["data"] is not None:
            title = "Source: Metadata RAW - CACHED\n"
            data = state["data"]
            text = state["text"]

        else:
            logger.debug("Source: Empty on CImagePreviewFromMetadata")
            text = "Source: Empty"

        data["ui"]["text"] = [title + text]
        return io.NodeOutput.from_dict(data)

    @classmethod
    def resolveImage(cls, filename: str | None = None) -> list[dict]:
        images = []

        if filename is not None:
            image_input_folder = os.path.normpath(folder_paths.get_input_directory())
            image_input_folder_abs = Path(image_input_folder).resolve()

            image_path = os.path.normpath(filename)
            image_path_abs = Path(image_path).resolve()

            if Path(image_path_abs).is_file() is False:
                raise Exception(TEXTS.FILE_NOT_FOUND.value)

            try:
                # get common path, should be input/output/temp folder
                common = os.path.commonpath([image_input_folder_abs, image_path_abs])

                if common != image_input_folder:
                    raise Exception("Path invalid (should be in the input folder)")

                relative = os.path.normpath(os.path.relpath(image_path_abs, image_input_folder_abs))

                images.append({
                    "filename": Path(relative).name,
                    "subfolder": os.path.dirname(relative),
                    "type": "input"
                })

            except Exception as e:
                logger.warn(e)

        return images


class CImageGetResolution(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CIMAGE_GET_RESOLUTION_NAME.value,
            display_name=CLASSES.CIMAGE_GET_RESOLUTION_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.IMAGE.value,
            inputs=[
                io.Image.Input('image'),
            ],
            outputs=[
                io.Int.Output(display_name='width'),
                io.Int.Output(display_name='height'),
            ],
            hidden=[io.Hidden.unique_id, io.Hidden.extra_pnginfo],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, image: io.Image.Type) -> io.NodeOutput:
        unique_id = cls.hidden.unique_id
        extra_pnginfo = cls.hidden.extra_pnginfo
        res = getResolutionByTensor(image)
        text = [f"{res['x']}x{res['y']}"]
        setWidgetValues(text, unique_id, extra_pnginfo)
        logger.debug(f"Resolution: {text}")
        return io.NodeOutput.from_dict({'ui': {'text': text}, 'result': (res['x'], res['y'])})


# subfolders based on: https://github.com/catscandrive/comfyui-imagesubfolders
class CImageLoadWithMetadata(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        input_dir = folder_paths.get_input_directory()
        exclude_files = {"Thumbs.db", "*.DS_Store", "desktop.ini", "*.lock" }
        exclude_folders = {"clipspace", ".*"}
        file_list = []
        for root, dirs, files in os.walk(input_dir, followlinks=True):
            # Exclude specific folders
            dirs[:] = [d for d in dirs if not any(fnmatch.fnmatch(d, exclude) for exclude in exclude_folders)]
            files = [f for f in files if not any(fnmatch.fnmatch(f, exclude) for exclude in exclude_files)]


            for file in files:
                relpath = os.path.relpath(os.path.join(root, file), start=input_dir)
                # fix for windows
                relpath = relpath.replace("\\", "/")
                file_list.append(relpath)
        return io.Schema(
            node_id=CLASSES.CIMAGE_LOAD_METADATA_NAME.value,
            display_name=CLASSES.CIMAGE_LOAD_METADATA_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.IMAGE.value,
            inputs=[
                io.Combo.Input('image', options=sorted(file_list), upload=io.UploadType.image),
            ],
            outputs=[
                io.Image.Output(display_name='image'),
                io.Mask.Output(display_name='mask'),
                io.Custom('JSON').Output(display_name='prompt'),
                io.Custom('METADATA_RAW').Output(display_name='Metadata RAW'),
            ],
            is_output_node=True,
        )

    @classmethod
    def execute(cls, image: str) -> io.NodeOutput:
        image_path = folder_paths.get_annotated_filepath(image)

        imgF = Image.open(image_path)
        img, prompt, metadata = buildMetadata(image_path)
        if imgF.format == 'WEBP':
            # Use piexif to extract EXIF data from WebP image
            try:
              exif_data = piexif.load(image_path)
              prompt, exif_metadata = cls.process_exif_data(exif_data)
              metadata.update(exif_metadata)
            except ValueError:
              prompt = {}

        img = ImageOps.exif_transpose(img)
        image = img.convert("RGB")
        image = np.array(image).astype(np.float32) / 255.0
        image = torch.from_numpy(image)[None,]
        if 'A' in img.getbands():
            mask = np.array(img.getchannel('A')).astype(np.float32) / 255.0
            mask = 1. - torch.from_numpy(mask)
        else:
            mask = torch.zeros((64, 64), dtype=torch.float32, device="cpu")

        return io.NodeOutput(image, mask.unsqueeze(0), prompt, metadata)

    @classmethod
    def process_exif_data(cls, exif_data: dict) -> tuple[object, dict]:
        metadata = {}
        # EXIF Make carries the generation prompt in this WebP format.
        if '0th' in exif_data and 271 in exif_data['0th']:
            prompt_data = exif_data['0th'][271].decode('utf-8')
            # Remove the optional label before decoding JSON.
            prompt_data = prompt_data.replace('Prompt:', '', 1)
            try:
                metadata['prompt'] = json.loads(prompt_data)
            except json.JSONDecodeError:
                metadata['prompt'] = prompt_data

        # EXIF ImageDescription carries the workflow.
        if '0th' in exif_data and 270 in exif_data['0th']:
            workflow_data = exif_data['0th'][270].decode('utf-8')
            workflow_data = workflow_data.replace('Workflow:', '', 1)
            try:
                metadata['workflow'] = json.loads(workflow_data)
            except json.JSONDecodeError:
                metadata['workflow'] = workflow_data

        metadata.update(exif_data)
        return metadata.get("prompt", {}), metadata

    @classmethod
    def fingerprint_inputs(cls, image: str) -> str | float:
        image_path = folder_paths.get_annotated_filepath(image)
        m = hashlib.sha256()
        with open(image_path, 'rb') as f:
            m.update(f.read())
        return m.digest().hex()

    @classmethod
    def validate_inputs(cls, image: str) -> bool | str:
        if not folder_paths.exists_annotated_filepath(image):
            return "Invalid image file: {}".format(image)

        return True


class CImageSaveWithExtraMetadata(io.ComfyNode):
    @classmethod
    def define_schema(cls) -> io.Schema:
        return io.Schema(
            node_id=CLASSES.CIMAGE_SAVE_METADATA_NAME.value,
            display_name=CLASSES.CIMAGE_SAVE_METADATA_DESC.value,
            category=CATEGORY.MAIN.value + CATEGORY.IMAGE.value,
            inputs=[
                io.Image.Input('image'),
                io.String.Input('filename_prefix', default='ComfyUI'),
                io.Boolean.Input('with_workflow', default=True),
                io.String.Input('metadata_extra', optional=True, multiline=True, default=json.dumps({'Title': 'Image generated by Crystian', 'Description': 'More info: https://www.instagram.com/crystian.ia', 'Author': 'crystian.ia', 'Software': 'ComfyUI', 'Category': 'StableDiffusion', 'Rating': 5, 'UserComment': '', 'Keywords': [''], 'Copyrights': ''}, indent=CONFIG['indent']).replace('\\/', '/')),
            ],
            outputs=[
                io.Custom('METADATA_RAW').Output(display_name='Metadata RAW'),
            ],
            hidden=[io.Hidden.prompt, io.Hidden.extra_pnginfo],
            is_output_node=True,
        )

    @classmethod
    def execute(
        cls,
        image: io.Image.Type | None = None,
        filename_prefix: str = 'ComfyUI',
        with_workflow: bool = True,
        metadata_extra: str | None = None,
    ) -> io.NodeOutput:
        prompt = cls.hidden.prompt
        extra_pnginfo = cls.hidden.extra_pnginfo
        saver = SaveImage()
        data = {
            "result": [''],
            "ui": {
                "text": [''],
                "images": [],
            }
        }
        if image is not None:
            if with_workflow is True:
                extra_pnginfo_new = extra_pnginfo.copy() if extra_pnginfo else {}
                prompt = prompt.copy() if prompt else None
            else:
                extra_pnginfo_new = None
                prompt = None

            if metadata_extra is not None and metadata_extra != 'undefined':
                try:
                    # metadata_extra = json.loads(f"{{{metadata_extra}}}") // a fix?
                    metadata_extra = json.loads(metadata_extra)
                except Exception as e:
                    logger.error(f"Error parsing metadata_extra (it will send as string), error: {e}")
                    metadata_extra = {"extra": str(metadata_extra)}

                if isinstance(metadata_extra, dict):
                    for k, v in metadata_extra.items():
                        if extra_pnginfo_new is None:
                            extra_pnginfo_new = {}

                        extra_pnginfo_new[k] = v

            saved = saver.save_images(image, filename_prefix, prompt, extra_pnginfo_new)

            image = saved["ui"]["images"][0]
            image_path = Path(saver.output_dir).joinpath(image["subfolder"], image["filename"])
            img, promptFromImage, metadata = buildMetadata(image_path)

            images = [image]
            result = metadata

            data["result"] = [result]
            data["ui"]["images"] = images

        else:
            logger.debug("Source: Empty on CImageSaveWithExtraMetadata")

        return io.NodeOutput.from_dict(data)



def buildMetadata(image_path):
    if Path(image_path).is_file() is False:
        raise Exception(TEXTS.FILE_NOT_FOUND.value)

    img = Image.open(image_path)

    metadata = {}
    prompt = {}

    metadata["fileinfo"] = {
        "filename": Path(image_path).as_posix(),
        "resolution": f"{img.width}x{img.height}",
        "date": str(datetime.fromtimestamp(os.path.getmtime(image_path))),
        "size": str(get_size(image_path)),
    }

    # only for png files
    if isinstance(img, PngImageFile):
        metadataFromImg = img.info

        # for all metadataFromImg convert to string (but not for workflow and prompt!)
        for k, v in metadataFromImg.items():
            # from ComfyUI
            if k == "workflow":
                try:
                    metadata["workflow"] = json.loads(metadataFromImg["workflow"])
                except Exception as e:
                    logger.warn(f"Error parsing metadataFromImg 'workflow': {e}")

            # from ComfyUI
            elif k == "prompt":
                try:
                    metadata["prompt"] = json.loads(metadataFromImg["prompt"])

                    # extract prompt to use on metadataFromImg
                    prompt = metadata["prompt"]
                except Exception as e:
                    logger.warn(f"Error parsing metadataFromImg 'prompt': {e}")

            else:
                try:
                    # for all possible metadataFromImg by user
                    metadata[str(k)] = json.loads(v)
                except Exception as e:
                    logger.debug(f"Error parsing {k} as json, trying as string: {e}")
                    try:
                        metadata[str(k)] = str(v)
                    except Exception as e:
                        logger.debug(f"Error parsing {k} it will be skipped: {e}")

    if isinstance(img, JpegImageFile):
        exif = img.getexif()

        for k, v in exif.items():
            tag = TAGS.get(k, k)
            if v is not None:
                metadata[str(tag)] = str(v)

        for ifd_id in IFD:
            try:
                if ifd_id == IFD.GPSInfo:
                    resolve = GPSTAGS
                else:
                    resolve = TAGS

                ifd = exif.get_ifd(ifd_id)
                ifd_name = str(ifd_id.name)
                metadata[ifd_name] = {}

                for k, v in ifd.items():
                    tag = resolve.get(k, k)
                    metadata[ifd_name][str(tag)] = str(v)

            except KeyError:
                pass


    return img, prompt, metadata


def buildPreviewText(metadata):
    text = f"File: {metadata['fileinfo']['filename']}\n"
    text += f"Resolution: {metadata['fileinfo']['resolution']}\n"
    text += f"Date: {metadata['fileinfo']['date']}\n"
    text += f"Size: {metadata['fileinfo']['size']}\n"
    return text
