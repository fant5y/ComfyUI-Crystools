"""
@author: Crystian
@title: Crystools
@nickname: Crystools
@version: 1.27.4
@project: "https://github.com/crystian/comfyui-crystools",
@description: Plugins for multiples uses, mainly for debugging, you need them! IG: https://www.instagram.com/crystian.ia
"""

from comfy_api.latest import ComfyExtension, io

from .core import version, logger
logger.info(f'Crystools version: {version}')

from .nodes.primitive import CBoolean, CText, CTextML, CInteger, CFloat
from .nodes.switch import CSwitchBooleanAny, CSwitchBooleanLatent, CSwitchBooleanConditioning, CSwitchBooleanImage, \
  CSwitchBooleanString, CSwitchBooleanMask, CSwitchFromAny
from .nodes.first_available import CSwitchAnyAuto
from .nodes.debugger import CConsoleAny, CConsoleAnyToJson
from .nodes.image import CImagePreviewFromImage, CImageLoadWithMetadata, CImageGetResolution, CImagePreviewFromMetadata, \
    CImageSaveWithExtraMetadata
from .nodes.list import CListAny, CListString
from .nodes.pipe import CPipeToAny, CPipeFromAny, CPipeEditInternal, CPipeOverrideGuard
from .nodes.utils import CUtilsCompareJsons, CUtilsStatSystem
from .nodes.metadata import CMetadataExtractor, CMetadataCompare
from .nodes.parameters import CJsonFile, CJsonExtractor
from .server import *
from .general import *

class CrystoolsExtension(ComfyExtension):
    async def get_node_list(self) -> list[type[io.ComfyNode]]:
        return [
            CBoolean,
            CText,
            CTextML,
            CInteger,
            CFloat,
            CConsoleAny,
            CConsoleAnyToJson,
            CListAny,
            CListString,
            CSwitchAnyAuto,
            CSwitchFromAny,
            CSwitchBooleanAny,
            CSwitchBooleanLatent,
            CSwitchBooleanConditioning,
            CSwitchBooleanImage,
            CSwitchBooleanMask,
            CSwitchBooleanString,
            CPipeToAny,
            CPipeFromAny,
            CPipeEditInternal,
            CPipeOverrideGuard,
            CImageLoadWithMetadata,
            CImageGetResolution,
            CImagePreviewFromImage,
            CImagePreviewFromMetadata,
            CImageSaveWithExtraMetadata,
            CMetadataExtractor,
            CMetadataCompare,
            CUtilsCompareJsons,
            CUtilsStatSystem,
            CJsonFile,
            CJsonExtractor,
        ]


async def comfy_entrypoint() -> CrystoolsExtension:
    return CrystoolsExtension()


WEB_DIRECTORY = "./web"
__all__ = ["comfy_entrypoint", "WEB_DIRECTORY"]
