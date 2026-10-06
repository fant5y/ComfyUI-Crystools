from collections.abc import Iterable


class PipeValues(list[object]):
    """Carry pipe field identities alongside the existing list payload."""

    def __init__(self, values: Iterable[object], layout: list[dict | None]) -> None:
        super().__init__(values)
        self.layout = list(layout)


def pipe_layout(hidden: object) -> list[dict | None]:
    metadata = getattr(hidden, 'extra_pnginfo', None) or {}
    graph = metadata.get('workflow', {})
    definitions = {item['id']: item for item in graph.get('definitions', {}).get('subgraphs', [])}
    path = str(getattr(hidden, 'unique_id', '')).split(':')
    for index, node_id in enumerate(path):
        node = next((item for item in graph.get('nodes', []) if str(item['id']) == node_id), None)
        if node is None:
            return []
        if index == len(path) - 1:
            properties = node.get('properties', {})
            return properties.get('crystools_pipe_layouts', {}).get(
                ':'.join(path), properties.get('crystools_pipe_layout', []),
            )
        graph = definitions.get(node.get('type'), {})
    return []


def field_keys(layout: list[dict | None]) -> list[tuple[str, str, int] | None]:
    counts: dict[tuple[str, str], int] = {}
    keys = []
    for field in layout:
        if field is None:
            keys.append(None)
            continue
        identity = (field['label'], str(field['type']))
        occurrence = counts.get(identity, 0)
        counts[identity] = occurrence + 1
        keys.append((*identity, occurrence))
    return keys


def align_pipe(value: object, layout: list[dict | None]) -> object:
    if not isinstance(value, PipeValues) or not layout:
        return value
    if len(layout) > 100:
        raise ValueError('Crystools pipes support up to 100 values across all switch branches')
    source_keys = field_keys(value.layout)
    target_keys = field_keys(layout)
    positions = {key: index for index, key in enumerate(target_keys) if key is not None}
    result = [None] * max(6, len(layout))
    for index, item in enumerate(value):
        key = source_keys[index] if index < len(source_keys) else None
        if key is None:
            if item is None:
                continue
            # Unnamed values retain their position only when it is also unnamed.
            if index < len(target_keys) and target_keys[index] is not None:
                raise ValueError('Cannot align an unnamed Crystools pipe value with a named field')
            target = index
        elif key in positions:
            target = positions[key]
        else:
            raise ValueError(f'Crystools pipe field {key[0]!r} is missing from the switch layout; refresh the workflow')
        if target >= 100:
            raise ValueError('Crystools pipes support up to 100 values')
        result.extend([None] * max(0, target + 1 - len(result)))
        result[target] = item
    return PipeValues(result, layout)
