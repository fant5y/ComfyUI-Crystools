# Switch Any if Empty Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans in this session; use TDD for each task.

**Goal:** Combine empty checking and independently optional lazy branches, omitting marked optional receiver arguments.

**Architecture:** A V3 node emits an explicit EMPTY marker. A Crystools-owned wrapper around `execution.get_input_data` removes only marked optional argument streams.

**Tech Stack:** Python 3.12, ComfyUI V3 API, unittest, existing Node frontend regressions.

**Spec:** ../specs/2026-10-24-switch-any-if-empty-design.md

## Global Constraints

- Preserve existing switch IDs and behavior; no ComfyUI source edits or production dependencies.
- Either branch can be unconnected; ordinary None is unchanged outside the new switch.
- Required input omissions are errors; raw-link inputs are untouched.

## Review Focus

- Omitted optional values must reach V1 and V3 receivers as absent arguments.
- Lazy missing links differ from evaluated None and from disconnected branches.
- Repeated hook installation must not nest wrappers or disturb existing hooks.
- Mixed streams must not silently reorder values; cached EMPTY must remain recognisable.
- Zero/False and nonempty tensor/container values must preserve their meaning.

## Task 1: Marker and input omission

Files: `core/optional.py`, `tests/optional_switch.py`.

- [x] Write integration tests using installed `execution.get_input_data` and the native list mapper; watch omission fail before implementation.
- [x] Add `EMPTY` and `install_optional_input_hook()`; remove only wholly marked optional streams, reject required and mixed streams, retain native metadata and raw links.
- [x] Prove V1/V3 defaults, cached outputs, lists, lazy behavior, ordinary None, required rejection, and idempotence.

## Task 2: Node, registration, docs

Files: `nodes/switch_if_empty.py`, `nodes/_names.py`, `__init__.py`, `README.md`, `tests/optional_switch.py`.

- [x] Write failing tests for branch selection in both directions, independently missing branches and lazy suppression.
- [x] Add `CSwitchAnyIfEmpty` with value, optional lazy branches and zero_is_empty; register it and install the hook during extension loading.
- [x] Document the node and limitations; run the complete regression script and existing `tests/pipe_handover.cjs`.
- [x] Review the diff and verify all claims before presenting the local change.
