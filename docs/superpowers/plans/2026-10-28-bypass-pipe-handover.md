# Bypass routing and pipe handover correction

Scope: preserve native purple bypass, optional branches, and existing pipe values.
Leave the workflow-changed preflight guard unchanged. Do not edit ComfyUI core.

1. Add source-only regression cases for receivers across nested subgraph output
   boundaries and frontend reroutes. Resolve receivers using the serialized API
   input links, which already flatten those boundaries, rather than canvas links.
   Only output zero may control bypass; preserve Boolean receivers and manual modes.
   Reject an internal receiver shared by multiple subgraph instances: changing its
   native mode would otherwise change unrelated siblings. Do not clone definitions.
2. Add pipe layout cases for Switch Any (If Empty), including either disconnected
   branch, repeated pipe hops, differing branch orders, and the Boolean output.
   Read only on_true/on_false when describing its output. Combine field alternatives
   by slot; do not reorder runtime payloads or use the checked value as a branch.
   Keep the existing Auto switch layout and template rules unchanged.
3. Mirror frontend changes in pipe.ts and the checked-in pipe.js. Source-review
   changes and run git diff --check only. Request independent source review.
4. Commit and push the authorized fork branch for the user to pull and try.

Validation restriction: no project execution, compiler/linter, tests, imports,
ComfyUI launch, or calls to the running ComfyUI without explicit user approval.
Regression cases will be written but remain unexecuted.

Source-review outcome: both the initial review findings (shared-instance mode
mutation and a dangling link in the nested fixture) were addressed. The follow-up
source review reported no further actionable findings. Tests and compilation
remain unexecuted; git diff --check is the only automated validation.
