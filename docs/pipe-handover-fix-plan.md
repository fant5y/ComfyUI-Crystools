# Crystools handover repair plan

Baseline: `3532b82`, audited 2026-10-07. Companion: `pipe-handover-audit.md`.
The plan covers the five reproduced defects first, then the additional naming
gaps. Implementation and isolated regression checks completed; live workflow acceptance remains pending.

## Contracts to preserve

- Existing node IDs, server input keys, connected socket indices and workflows.
- First-connected template order, independent of mute/bypass activation.
- Source labels/colors on genuinely connected inputs; template hints only fill
  descriptions that are otherwise absent.
- Ordinary None for empty extracted values, so availability checks execute.
- Empty overrides preserve existing values; False and zero are valid values.
- Optional reference processing remains lazy, without user-added helper nodes.
- Shared definitions have separate instance paths and execution layouts.
- Descriptions never create values. Values never shift just because another
  value is missing. Display labels and runtime routing identity must agree.
- Keep the 100-field limit and positional behavior of legacy unnamed API pipes.

## 1. Turn the audit reproductions into regression checks

Files: adjacent `audit_pipe_inheritance.cjs`, `audit_pipe_runtime.py`,
`validate_pipe.cjs`, `validate_v3.py`, `validate_optional_reference.py`.

The audit diagnostics currently assert the defective outcomes. Replace those
expectations with desired behavior as each fix lands. Keep the existing checks.
Add combinations that the original tests missed:

- Three identical IMAGE fields, middle None, through one and two switches.
- First/last/all fields missing, with False/zero and repeated label/type pairs.
- Skipped override with a different label; then a different type; then a
  duplicate label already present elsewhere in the pipe.
- Shared definition A -> B -> C in series, nested serial instances, independent
  parallel instances, and genuine cycles.
- Template -> switch with sibling behind Pipe from, edit chains, reroutes,
  nested switches and subgraph boundaries.
- An empty templated slot extracted and repacked repeatedly without a value
  being invented or its description reverting to any_N.
- Save/reload, reconnect, group rename and mute/bypass after each route.

Acceptance: the new tests fail before their respective repairs and pass after;
existing behavior checks continue to pass.

## 2. Repair empty-slot identity before changing frontend traversal

Files: `nodes/pipe.py`, `core/pipe.py`.

In `edit_pipe`, retain an available inherited identity when an override is empty.
For a slot with no inherited value/identity, retain its declared field description
even when its value is None. Count duplicate occurrences over the declared layout,
including empty slots, rather than over available payloads.

Keep source payloads unchanged. Do not solve this by compacting values, inserting
dummy data, or assigning the next available image to the preceding empty field.

Acceptance: `[first, None, third]` remains exactly that after named alignment,
including repeated switches and save/reload metadata. No change to None queries
or optional-reference branch evaluation.

## 3. Make fallback and override identities a consistent contract

Files: `web/pipe.ts`, `core/pipe.py`, `nodes/pipe.py`,
`nodes/first_available.py` only if its canonical-layout consumption needs updating.

The editor has two possible field descriptions: the inherited field when the
override is unavailable, and the replacement field when it is available. Preserve
that distinction instead of publishing only the connected replacement.

Implementation steps:

1. Represent possible inherited/replacement descriptions per slot in the frontend
   resolver, preserving the existing primary layout for legacy workflows.
2. Include every valid fallback identity in the switch's canonical field layout.
   Build this from per-slot alternatives; do not enumerate exponentially many
   complete payload combinations.
3. Make duplicate occurrence assignment consistent for empty slots and alternatives.
   Test an override that introduces a label already used by a later slot. Simply
   appending alternate labels to a union is insufficient for repeated identities.
4. Carry the actually selected field identity with the runtime value. Do not
   rename retained MODEL data to an unavailable STRING override's identity.
5. Keep output indices stable while switching. If a slot can contain different
   types, advertise a wildcard rather than falsely claiming the replacement type.
6. Validate the canonical union against capacity before exposing an unusable
   layout; keep a useful error when valid alternatives exceed 100 fields.
7. Read older workflows without alternatives metadata through the existing
   compatible path. Record the metadata extension and migration behavior.

Acceptance: available and unavailable overrides both align successfully, retain
the correct value/type, and produce descriptions consistent with their canonical
output positions. The duplicate-field fixes from step 2 remain valid.

## 4. Make recursion instance-aware

File: `web/pipe.ts`.

Replace node-object-only and graph-definition-only visited keys with keys that
include the full host instance path. Reuse the existing instance-path machinery
in `contextKey`; cover both normal source traversal and subgraph input-boundary
traversal. Carry the same context through pipe and switch descriptions.

Keep cycle detection scoped to the current ancestry path. A legitimate later
instance of the same definition must not be treated as a repeated ancestor.

Acceptance: A -> B -> C of one shared definition inherits MODEL and colors all
the way through, with distinct serialized instance layouts. Real cycles still
terminate. Parallel/nested instances retain their own inputs and metadata.

## 5. Collect complete template ancestry

File: `web/pipe.ts`.

Replace the immediate Pipe to/edit test in `collectTemplates` with a complete
branch ancestry walk. Follow whole-pipe inputs through Pipe from, Pipe to/edit,
Crystools automatic switches, reroutes and native subgraph boundaries. Apply the
template to reachable creation/edit pipes on non-template branches, using their
full instance keys. Stop at ordinary processing outputs rather than assuming any
arbitrary node transparently forwards a whole pipe.

Keep connection chronology as the template owner. Use an explicit deterministic
precedence for competing nested templates: the nearest switch's existing template
supplies local hints; an outer switch fills remaining undescribed fields. Detect
conflicts rather than letting node iteration order decide names. Connected source
descriptions continue to win over hints.

Acceptance: inserting a Pipe from, extra editor, reroute or subgraph between a
sibling and its switch no longer prevents template completion. Mute/bypass and
reload do not change the owner; disconnecting it promotes the remaining source.

## 6. Forward inherited descriptions through the shared resolver

File: `web/pipe.ts`.

Move template-description inheritance into the recursive pipe-description path,
instead of appending hints only in `refreshNode`. Use that resolved description
consistently for visible slots, downstream descriptions and serialized metadata.
Maintain the distinction between describing an empty field and supplying a value.

Avoid a template feedback loop: first collect structural candidate layouts and
template ownership, then resolve inherited hints. Do not derive a template from
the stale decorated slots of its own sibling.

Acceptance: an empty sibling input labelled MODEL remains MODEL at its extractor,
through repacking, through another switch and through nested subgraphs. Runtime
value stays None and IfNone still executes. Reloaded layouts match the display.

## 7. Close the additional naming gaps

File: `web/pipe.ts`; inspect pinned frontend APIs before adding an instance hook.

- Whole-pipe title precedence: enclosing group, explicit local/manual title,
  inherited bundle title, then CPipeAny. An ungrouped intermediate extractor
  should forward Reference Image instead of resetting the switch input to CPipeAny.
- Shared-definition inner canvas: obtain the actual active host path from supported
  frontend context APIs. Use that path for display, while keeping serialized
  layouts for every instance. If no host is selected, do not silently take another
  instance's names as universally correct.
- Refresh propagation: test upstream rename, group title changes, mode changes,
  conversion to a subgraph and workflow configuration. Verify event names against
  the pinned frontend before adding hooks.

Acceptance: names update through the complete path without reconnecting cables;
explicit local names and group titles keep their documented precedence.

## 8. Validate and prepare the change for live testing

Run TypeScript compilation and the existing ESLint command. Regenerate the
committed `web/pipe.js` and `web/pipe.d.ts` from the TypeScript source. Run frontend
graph checks, actual V3 schema/input/mapper checks, and optional-reference checks.
Review the diff for unrelated generated files and changed socket indices.

Measure refresh time on representative long chains and shared-instance graphs.
Add per-refresh memoization only if repeated work is materially slow; key any
cache by instance and invalidate it on relevant graph changes.

Update README/MIGRATION with the resulting inheritance rules and remaining
boundaries. Commit and push unsigned on the repair branch, as authorized by the user.
Do not request signing or approval for the push.

Live acceptance workflow: two differently ordered model pipes, missing duplicate
images, an optional reference-conditioning override, chained switches and repeated
shared subgraphs. Test image absent/present, branch activation changes and reload.
Compare actual outputs as well as their displayed names/colors. Merge after that
live verification succeeds.
