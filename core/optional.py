"""Omit explicitly empty optional arguments without changing ordinary None."""

from enum import Enum
from functools import wraps

import execution


class _EmptyInput(Enum):
    EMPTY = 'crystools_optional_argument_absent'

    def __repr__(self) -> str:
        return 'EMPTY'


EMPTY = _EmptyInput.EMPTY
_OMITTED = 'crystools_omitted_inputs'


def install_optional_input_hook() -> None:
    """Install the scoped argument-omission hooks once for this process."""
    if getattr(execution.get_input_data, '_crystools_optional_inputs', False):
        return
    original_inputs = execution.get_input_data
    original_mapper = execution._async_map_node_over_list

    @wraps(original_inputs)
    def get_input_data(inputs, class_def, unique_id, *args, **kwargs):
        data, missing, metadata = original_inputs(inputs, class_def, unique_id, *args, **kwargs)
        marked = {name for name, stream in data.items() if any(item is EMPTY for item in stream)}
        if not marked:
            return data, missing, metadata
        valid_inputs = class_def.INPUT_TYPES()
        if issubclass(class_def, execution._ComfyNodeInternal):
            valid_inputs, _, _ = execution._io.get_finalized_class_inputs(valid_inputs, inputs)
        for name in marked:
            _, category, info = execution.get_input_info(class_def, name, valid_inputs)
            if info and info.get('rawLink', False):
                continue
            if category != 'optional':
                raise ValueError(f'Crystools EMPTY cannot omit required or undeclared input {unique_id}.{name}')
            if any(item is not EMPTY for item in data[name]):
                raise ValueError(f'Crystools EMPTY mixed with values at {unique_id}.{name}; split the execution stream')
            del data[name]
            missing.pop(name, None)
            metadata.setdefault(_OMITTED, set()).add(name)
        omitted = metadata.get(_OMITTED, ())
        if omitted and issubclass(class_def, execution._ComfyNodeInternal):
            # V3 rebuilds missing dynamic leaves as None using these paths.
            # Finalize as if the marked sockets were disconnected, including
            # native defaults for an entirely empty Autogrow group.
            _, _, dynamic_metadata = execution._io.get_finalized_class_inputs(
                class_def.INPUT_TYPES(),
                {name: value for name, value in inputs.items() if name not in omitted})
            for name in ('dynamic_paths', 'dynamic_paths_default_value', 'list_paths'):
                metadata.pop(name, None)
            metadata.update(dynamic_metadata)
        return data, missing, metadata

    @wraps(original_mapper)
    async def map_node_over_list(prompt_id, unique_id, obj, input_data_all, func, *args, **kwargs):
        # Metadata accompanies both V1 and V3 nodes. Keep native metadata intact.
        metadata = kwargs.get('v3_data')
        if metadata is None and len(args) > 3:
            metadata = args[3]
        omitted = metadata.get(_OMITTED, ()) if metadata else ()
        results = await original_mapper(prompt_id, unique_id, obj, input_data_all, func, *args, **kwargs)
        if func == 'check_lazy_status' and omitted:
            results = await execution.resolve_map_node_over_list_results(results)
            # A resolved EMPTY must not become an unresolved lazy dependency.
            return [[name for name in result if name not in omitted]
                    if isinstance(result, list) else result for result in results]
        return results

    get_input_data._crystools_optional_inputs = True
    execution.get_input_data = get_input_data
    execution._async_map_node_over_list = map_node_over_list
