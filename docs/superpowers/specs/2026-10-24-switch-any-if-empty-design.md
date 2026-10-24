# Switch Any if Empty

Approved direction: the user requested implementation after reviewing the combined switch and the in-memory executor hook.

## Contract

Add one generic node with `value`, independently optional lazy `on_true` and `on_false`, and `zero_is_empty` defaulting to false. True means the checked value is empty. Either branch may be unconnected; the opposite branch must not run. Existing switch nodes keep their IDs and behavior.

Return an explicit EMPTY marker for an unconnected selected branch or a selected branch resolving to None. A narrowly scoped Crystools wrapper around `execution.get_input_data` removes marked optional arguments. Ordinary None stays unchanged. Required inputs reject EMPTY with a useful error. No installed ComfyUI source files are changed.

Empty checks reuse the fork's existing empty-value semantics; zero and false remain usable by default. Markers arriving at this node are treated as empty, enabling chains.

## Approach

A node alone cannot make existing receivers omit an argument. Graph expansion can omit inputs only for nodes that it builds, requiring wrappers around receivers. The chosen executor hook preserves existing receivers and visible wires. It is an in-memory patch of a private API, so compatibility must be tested against the installed executor and documented.

Omit whole marked input streams. For mixed streams preserve positions by rejecting mixed EMPTY/data streams rather than silently shifting alignment. Preserve raw-link inputs, runtime metadata, and unresolved lazy inputs. Do not suppress failures from required inputs or receivers that also fail when genuinely disconnected.

Implementation refinement: also wrap `_async_map_node_over_list` to filter lazy-status requests for the explicitly omitted keys. This prevents an optional lazy receiver from requesting an already resolved EMPTY indefinitely. All other mapper results stay native.

## Verification

Use the installed ComfyUI executor on CPU: verify V1/V3 default arguments, both branch directions, lazy unselected branches, cached values, required-input rejection, input lists, None preservation, and idempotent hook installation. Run existing pipe frontend regression tests. No installation, GPU job, merge, or publication is part of this change.
