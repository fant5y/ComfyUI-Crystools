from functools import cache


@cache
def get_preview_state(node_type: str, node_id: str) -> dict:
    """Retain the last preview for each V3 node across execution class clones."""
    return {"data": None, "text": None}
