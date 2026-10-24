# Runtime Empty Bypass Implementation Plan

Execute inline using the executing-plans skill. User requested action and has prohibited code execution without explicit approval.

**Goal:** Skip processing on explicit absence and route compatible inputs through while preserving visible connections.

**Architecture:** Extend the existing Crystools marker and executor wrapper with a separate BYPASS marker. Keep ordinary None and existing omission behavior unchanged.

**Tech Stack:** Existing Python 3.12 and ComfyUI V1/V3 APIs; no dependencies.

**Spec:** ../specs/2026-10-25-runtime-empty-bypass.md

- [x] Write regression cases for type-changing chains, matching-type pass-through, optional triggers, output-node side effects, serialization, lists and lazy passthrough requests. Retain existing ordinary-None cases. These cases have not been run.
- [x] Add bypass marker and scoped mapper routing in core/optional.py.
- [x] Expose empty_action in nodes/switch_if_empty.py, preserving output slots and previous default.
- [x] Document usage, routing ambiguity, eager upstream execution and verification limits.
- [x] Inspect diff and whitespace only. Do not run project code or tests without approval.
- [ ] Run the integration suite after explicit approval; actual execution, cache and scheduler behavior remain unverified.

Source review found that using the receiver's INPUT_IS_LIST flag would nest
passthrough samples. The bypass proxy now maps individual execution samples and
wraps only declared list outputs for native merging. Regression cases cover both
OUTPUT_IS_LIST settings on a list-consuming receiver. Runtime validation is pending.
