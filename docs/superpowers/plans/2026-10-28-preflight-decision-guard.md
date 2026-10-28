# Scope the bypass preflight guard to its decision inputs

The current guard compares the entire serialized workflow after awaiting a check.
Unrelated execution updates, metadata and JSON key ordering can reject submission.
The existing report does not identify which field triggered the comparison.

1. Add source-only regression cases for unrelated input updates, node titles,
   reordered object keys, changed upstream inputs/classes, active graph changes,
   and mutable input objects shared across serializations.
2. Freeze the submitted check's ancestor output using JSON transport semantics.
   Compare only ancestor node types and inputs, with stable object-key ordering.
   Preserve array order. Ignore unrelated nodes and display metadata.
3. Retain rejection for a different active graph or changed check dependencies.
   Report bounded node/input paths without exposing input values.
4. Source review, git diff --check, signed commit and push for the user to try.

No tests, compilers, imports, ComfyUI or local API calls may execute without
explicit user approval. Written regression cases remain unexecuted.

Source review also covered receivers added during a check, rollback of those
receivers, and earlier decisions becoming stale while later checks execute.
Completed decisions are revalidated after every check and before submission.
The follow-up source review reported no further important findings.
git diff --check passed; runtime behavior remains unverified.
