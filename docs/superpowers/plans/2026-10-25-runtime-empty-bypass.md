# Correct native purple bypass

- Remove the backend BYPASS marker and forwarding proxy; retain EMPTY omission.
- Add a dev-only output probe reporting whether the selected branch is absent.
- Before main submission check reachable switches upstream-first, set only direct
  receivers to mode 4, then use native graphToPrompt for the main workflow.
- Restore only extension-owned modes for the next check; preserve manual modes.
- Keep both branches optional and preserve the boolean second output.
- Update regression sources and documentation; request source-only review.
- Inspect diff and whitespace, commit and push for the user to pull and try.

No project code or tests may run without explicit approval. Runtime validation
remains pending; source review and whitespace checks do not establish correctness.