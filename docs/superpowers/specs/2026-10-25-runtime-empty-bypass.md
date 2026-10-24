# Native purple bypass on an empty selected branch

Corrected requirement: empty_action=bypass sets only nodes directly connected
to output 0 (any) to native mode 4. They become purple. Other nodes retain
their modes, and ComfyUI's native serialization handles bypass routing. No
runtime bypass marker propagates through the graph. Either branch may be
unconnected, and output 1 remains the is_empty boolean.

Runtime emptiness must be known before main-workflow serialization. The frontend
queue wrapper checks switch ancestors using an internal output-node variant of
the switch, waits for its result, changes direct receiver modes, then serializes
and submits the main workflow. Dependent switches are checked upstream-first,
reserializing between checks. Disconnected controls are not evaluated. Bypassing
the last requested output leaves a valid purple canvas with no main job queued.

Checks run only when the user queues a workflow, on their configured device.
Upstream work may execute twice if caching cannot reuse it. Decisions describe
the check's values; non-deterministic upstream values can differ on main execution.
A failed check cancels main submission and restores prior extension-owned modes.

On the next queue restore only extension-owned modes before checking again.
Preserve manually muted/bypassed nodes. Keep omit behavior unchanged, including
the existing scoped optional-input omission hook. API-only submissions cannot
implement canvas bypass. Native bypass cannot supply missing required values.

No tests, imports, ComfyUI launches, CPU jobs, or GPU jobs may execute without
explicit user approval. The user will pull and try the pushed branch.