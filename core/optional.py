"""Handle explicit argument omission and runtime bypass without changing ordinary None."""

from enum import Enum
from functools import wraps
from types import SimpleNamespace

import execution


class _EmptyInput(Enum):
    EMPTY = 'crystools_optional_argument_absent'
    BYPASS = 'crystools_bypass_receiver'

    def __repr__(self) -> str:
        return self.name


EMPTY = _EmptyInput.EMPTY
BYPASS = _EmptyInput.BYPASS
_OMITTED = 'crystools_omitted_inputs'
_BYPASS_INPUTS = 'crystools_bypass_input_types'
_BYPASS_MISSING = 'crystools_bypass_missing_inputs'


def _bypass_routes(obj, input_types: dict) -> list[str | None]:
    """Choose input sockets for outputs using deterministic bypass type matching."""
    names = list(input_types)

    def compatible(input_type, output_type):
        if not isinstance(input_type, str) or not isinstance(output_type, str):
            return False
        return (input_type in ('*', '') or output_type in ('*', '')
                or bool(set(input_type.split(',')) & set(output_type.split(','))))

    routes = []
    for index, output_type in enumerate(obj.RETURN_TYPES):
        name = None
        if index < len(names) and compatible(input_types[names[index]], output_type):
            name = names[index]
        if name is None:
            name = next((key for key in names if input_types[key] == output_type), None)
        if name is None:
            name = next((key for key in names if compatible(input_types[key], output_type)), None)
        routes.append(name)
    return routes


def _bypass_outputs(obj, input_types: dict, values: dict) -> tuple:
    """Route compatible inputs without calling the receiver's processing function."""
    results = []
    output_is_list = getattr(obj, 'OUTPUT_IS_LIST', ())
    for index, name in enumerate(_bypass_routes(obj, input_types)):
        value = values.get(name, BYPASS)
        if value is None or value is EMPTY:
            value = BYPASS
        is_list_output = index < len(output_is_list) and output_is_list[index]
        if is_list_output:
            value = [value]
        results.append(value)
    return tuple(results)


def install_optional_input_hook() -> None:
    """Install the scoped omission and bypass hooks once for this process."""
    if getattr(execution.get_input_data, '_crystools_optional_inputs', False):
        return
    original_inputs = execution.get_input_data
    original_mapper = execution._async_map_node_over_list

    @wraps(original_inputs)
    def get_input_data(inputs, class_def, unique_id, *args, **kwargs):
        data, missing, metadata = original_inputs(inputs, class_def, unique_id, *args, **kwargs)
        marked = {name for name, stream in data.items() if any(item is EMPTY for item in stream)}
        bypassed = {name for name, stream in data.items() if any(item is BYPASS for item in stream)}
        if not marked and not bypassed:
            return data, missing, metadata
        valid_inputs = class_def.INPUT_TYPES()
        if issubclass(class_def, execution._ComfyNodeInternal):
            valid_inputs, _, _ = execution._io.get_finalized_class_inputs(valid_inputs, inputs)
        if bypassed and not getattr(class_def, 'CRYSTOOLS_HANDLES_BYPASS', False):
            for name in bypassed:
                if any(item is not BYPASS for item in data[name]):
                    raise ValueError(f'Crystools BYPASS mixed with values at {unique_id}.{name}; split the execution stream')
            for name in marked:
                if any(item is not EMPTY for item in data[name]):
                    raise ValueError(f'Crystools EMPTY mixed with values at {unique_id}.{name}; split the execution stream')
            metadata[_BYPASS_INPUTS] = {
                name: info[0]
                for category in ('required', 'optional')
                for name, info in valid_inputs.get(category, {}).items()}
            metadata[_BYPASS_MISSING] = set(missing)
            return data, missing, metadata
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
        bypass_types = metadata.get(_BYPASS_INPUTS) if metadata else None
        if bypass_types is not None:
            if func == 'check_lazy_status':
                missing = metadata.get(_BYPASS_MISSING, ())
                return [list(dict.fromkeys(name for name in _bypass_routes(obj, bypass_types)
                                           if name is not None and name in missing))]
            if func == obj.FUNCTION:
                # Bypass individual samples even when processing normally consumes lists.
                # Wrapping list outputs above keeps native result merging lossless.
                receiver = SimpleNamespace(
                    INPUT_IS_LIST=False,
                    execute=lambda **values: _bypass_outputs(obj, bypass_types, values))
                routed_names = set(_bypass_routes(obj, bypass_types))
                routed_data = {name: stream or [BYPASS]
                               for name, stream in input_data_all.items() if name in routed_names}
                if not routed_data:
                    routed_data = {'_crystools_bypass': [BYPASS]}
                return await original_mapper(
                    prompt_id, unique_id, receiver, routed_data, 'execute', *args, **kwargs)
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
