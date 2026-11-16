# Crystools pipe handover audit

Audited 2026-10-07, commit `3532b82` on `codex/pipe-empty-overrides`.
Scope: complete inheritance routes implemented by Crystools, frontend display
metadata, serialized workflow metadata, Python pipe values and override guards.
This is a code-level path inventory, not a reconstruction of every connection in
your live workflow: no exported workflow JSON was provided for this audit.

## Findings that reproduce

### 1. High priority: a missing middle value can shift later duplicate fields

Path: source outputs -> Pipe to/edit -> Switch Any (Auto) -> Pipe from.

Three outputs all named IMAGE, with the middle value missing:

```
Before switch: [first image, None, third image]
After switch:  [first image, third image, None]
```

`nodes/pipe.py:44` assigns field metadata only when a nonempty value is supplied.
The missing slot therefore has no identity. `core/pipe.py:47` numbers duplicate
label/type occurrences using the remaining metadata entries; the third IMAGE
becomes the second IMAGE. `core/pipe.py:61` then routes it into slot 2.

This is a value-routing bug, not only a display issue. It requires named switch
alignment; direct positional extraction preserves the original hole.

Fix direction: preserve field identities for declared empty slots so occurrence
numbers describe the layout, not just the values that happened to be available.
Keep None in its slot and do not compact the payload.

### 2. High priority: repeated shared subgraph instances are mistaken for a cycle

Path: source pipe -> shared subgraph instance A -> instance B of the same
definition -> Pipe from.

A MODEL field becomes `any_1` at the final extractor. This reproduces with a
shared definition whose internal Pipe from forwards its whole pipe output.

`web/pipe.ts:176` tracks visited node objects. A and B share the same internal
node object, so revisiting that object in another instance is rejected. Its
subgraph-input guard also tracks graph definitions rather than instances.

Fix direction: include the full instance path in both cycle guards. A real
cycle must still stop, but A:node and B:node must be distinct visits. The existing
`contextKey` function at line 102 already identifies instance paths.

### 3. Medium priority: sibling templates stop at intermediate pipe nodes

Path: first template pipe -> switch input 1; empty sibling Pipe to -> Pipe from
whole output -> switch input 2.

The sibling Pipe to keeps `any_1` instead of inheriting MODEL. The normal direct
connection from that same sibling to the switch does inherit MODEL.

`web/pipe.ts:462` collects templates only for resolved sources whose immediate
node is Pipe to/edit. An intermediate Pipe from, or another switch, prevents
the template from reaching the actual creation/edit pipes behind it.

Fix direction: walk the complete pipe ancestry of each non-template branch,
carrying instance context and cycle protection. Preserve actual connected slot
identities, and make competing templates deterministic.

### 4. Medium priority: inherited template hints are not forwarded

Path: first template pipe -> switch; blank sibling Pipe to -> switch AND its
own Pipe from.

The blank Pipe to shows MODEL at input 1, but its Pipe from shows `any_1` at
output 1. The name disappears at the next handover.

`web/pipe.ts:385` adds template hints only when decorating the Pipe to.
`describePipe` at line 341, used for recursive downstream resolution, does not
include those hints. Updating more nodes cannot solve this: the recursive
description itself omits the inherited template.

Fix direction: distinguish inherited field descriptions from value availability,
and propagate the descriptions through the same recursive resolver. An empty
named field must remain empty; inheriting its name must not invent a value.

### 5. High priority: ignored overrides can leave frontend and runtime identities different

Path: base pipe positive field -> editor with an empty conditioning override ->
switch -> extractor.

The frontend describes the connected override as `conditioning`. Python keeps
the original value with its original `positive` identity. If the switch's saved
layout contains only `conditioning`, named alignment raises:

```
Crystools pipe field 'positive' is missing from the switch layout; refresh the workflow
```

`web/pipe.ts:341` uses the connected override's description without knowing if
its value will be available. `nodes/pipe.py:44` correctly retains the original
value and metadata when that override is empty. The two independently correct
local decisions violate the handover contract.

Even without a switch, downstream labels/types can describe the unavailable
override rather than the value actually retained in the pipe.

Fix direction: represent fallback and replacement identities consistently across
frontend metadata, canonical layouts and runtime values. Do not merely rename
the retained value to the override label: their types may differ.

## Complete path inventory

| Route | Frontend inheritance | Runtime handover | Current result |
| --- | --- | --- | --- |
| Ordinary source -> Pipe to value slot | Source label/name, type and colors through describeOutput | edit_pipe stores value and field description | Works for available values |
| Source -> reroute(s) -> pipe/switch | resolveSource follows reroute input 0 | Native prompt resolves the executable source | Existing checks pass |
| Pipe to whole output -> Pipe from | describePipe recursively follows pipe input 0 | PipeValues retains values/layout; extractor emits fields | Works for actual described fields; template hints are lost |
| Whole pipe -> edit -> edit -> extractor | Recursively inherit base layout, replace descriptions at connected override positions | Copy base values/layout, apply nonempty edits | Works with stable labels; ignored-override identity mismatch remains |
| Extracted field -> another Pipe to value input | describeOutput resolves the original field through Pipe from | The scalar is placed in the receiving position | Works for actual named fields |
| Extracted field -> processing -> Pipe to override | Processing node's own output label/type starts the new field description | Lazy guard checks required typed upstream fields, then requests the override | Existing optional-reference tests pass; retained fallback identity can differ |
| Pipe branches -> automatic switch -> extractor | pipeSources resolves branch origins; mergeLayouts makes canonical fields | First usable pipe is aligned by label/type/occurrence | Duplicate empty fields and fallback identities are unsafe |
| Scalar branches -> automatic switch -> pipe value input | First active branch supplies name/colors; output type is specific only when all branches agree | First nonempty scalar/list stream selected | Existing checks pass; runtime None selection can differ from static display |
| Automatic switch -> another automatic switch -> pipes | describeSwitch and describePipe recurse through supported switches | Each switch selects and aligns its own layout | Existing direct chained-switch tests pass; sibling template traversal remains shallow |
| Subgraph exported output -> outside pipe/switch | Follow host output into outputNode slot's internal link, retaining host context | Native prompt uses concrete executable node IDs | Existing nested export checks pass |
| Outside input -> subgraph input boundary -> internal pipe | Follow inputNode slot back to the specific host's external input | Runtime IDs and saved layouts include the host path | Parallel shared-instance execution metadata works; inner editor has no selected-instance display context |
| Nested subgraph input/output forwarding | Carry InstanceContext across every host boundary | pipe_layout follows colon-separated host/node IDs in workflow definitions | Existing nested checks pass |
| Shared instance A -> shared instance B in series | Current node-object/graph-definition cycle guards stop the second visit | Runtime instances have different concrete IDs | Frontend inheritance fails |
| First-connected template -> sibling input hints | collectTemplates stores per-node/per-instance hints | Hints are workflow metadata, not values | Direct sibling works; intermediates and downstream forwarding fail |
| Group title -> whole-pipe output -> switch | Smallest enclosing group, else output/manual name; switch follows selected source | Bundle display title is separate from per-field identities | Group changes pass existing checks; title does not automatically persist through an ungrouped intermediate extractor |
| Display metadata -> workflow properties -> Python field identities | saveLayout writes default and per-instance layouts | pipe_layout reads extra_pnginfo and unique_id; PipeValues carries layout | Works for matching paths; holes/fallbacks can disagree with serialized descriptions |

## Other boundaries and possible struggles

- **Bundle names also stop at an intermediate extractor.** A pipe titled
  Reference Image -> ungrouped Pipe from -> switch is displayed as CPipeAny at
  the switch. The extractor uses its own whole-output name; it does not inherit
  the incoming bundle name. Reproduced, but this needs a naming-policy decision:
  an extractor's own group or explicit custom title should still take precedence.
- **Shared-definition inner display is ambiguous.** Internal nodes are refreshed
  with an empty InstanceContext. With multiple hosts, uniqueHost refuses to pick
  one, so an inner canvas can show any_1 while external instance-specific outputs
  have correct labels. Selecting a host context is different from treating the
  definition as having one universal input layout.
- **Ordinary processing nodes are semantic boundaries.** Their own output names
  and types are used. Arbitrary nodes cannot safely be treated as transparent
  passthroughs: they may transform or select values. Other extensions' switches
  are not handled by the Crystools-specific recursive switch resolver.
- **Display activation is not runtime availability.** Switch labels use modes
  and socket order. Runtime selection also skips None/empty values. The displayed
  source label can therefore differ from the candidate selected during execution.
- **Mixed pipe/scalar switches have no universal pipe layout.** pipeSources
  rejects a mixed branch set, and the output remains a wildcard. This is an
  existing intentional boundary, not a proven lost-recursion defect.
- **Canonical layouts can exceed 100 distinct fields.** The frontend union is
  unbounded before visible slots are capped; Python rejects alignment beyond
  100. A large branch union can thus produce a server error despite each source
  pipe being within its own capacity.
- **Refresh cost needs measurement on a real workflow.** Descriptions are
  recursively recomputed, and saveLayout visits shared instances repeatedly.
  Diamond-shaped switch chains can repeat the same ancestor work. This is a
  structural performance risk, not a measured slowdown in this audit.
- **Override guards are not universal None handling.** They recognize required
  typed upstream pipe fields, respect lazy/raw inputs, and stop at other pipe
  editors. Separate output nodes can still request optional processing branches.
  These are documented boundaries of the recent conditioning fix.

## Evidence and validation

- `audit_pipe_inheritance.cjs`: runs the actual shipped web/pipe.js inside the
  existing graph fixture, including all previous frontend pipe checks. Reproduces
  indirect templates, serial shared definitions, lost hints, inner shared-display
  ambiguity and lost bundle names.
- `audit_pipe_runtime.py`: loads the pinned ComfyUI 0.38.0 V3 fixture and actual
  production edit/alignment functions. Reproduces duplicate-field shifting and
  the skipped-override identity error.
- Existing frontend checks and all 32 registered V3 class/schema checks still
  pass. Those checks did not cover these inheritance routes.
- Diagnostics intentionally assert the current defective outcomes; they should
  become corrected-behavior regression tests when the corresponding fixes land.
- No production files were modified by this audit. No live ComfyUI/GPU session
  was run here. Diagnostic scripts and pinned dependency fixtures are in this
  adjacent work directory.

Recommended order: fix sparse field identity and fallback identity first; then
instance-aware cycle guards; then full template ancestry/forwarding. Address
bundle-title inheritance and active-instance display explicitly, keeping names,
types, field identity, and availability separate at every handover.
