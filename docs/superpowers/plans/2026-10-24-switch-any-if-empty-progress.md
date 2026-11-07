# Implementation ledger

- Existing linked worktree is isolated; branch `codex/switch-any-if-empty`.
- Baseline frontend tests passed before changes.
- Task 1 RED: real CPU executor tests failed on missing core.optional; GREEN: six tests passed.
- Task 2 RED: selection tests failed on missing nodes.switch_if_empty before implementation.
- Ruling: also wrap the native async mapper to remove lazy requests for already omitted arguments. Removing only get_input_data keys lets receivers request them forever. The wrapper only changes check_lazy_status results for explicitly marked inputs; other calls use native results.
- Ruling: make checked value optional so omitted EMPTY from another switch can be checked as empty without requiring a fake source.
- No installed files or ComfyUI source files changed.
- Task 2 GREEN: schema/selection tests, real validated scheduler runs in both directions, selected None and nonempty values, unselected failing branches, cached EMPTY, input lists, and V3 hidden metadata passed (11 tests before review fixes).
- Independent fresh reviewer: no critical/important findings; minor undeclared-input error message bug reproduced RED and corrected.
- Additional RED: pickle round-trip lost marker identity. Replaced plain singleton with Enum singleton so serialized cache values retain identity.
- Existing frontend pipe regression script passed after implementation (40-editor refresh 41 ms).
- Final verification: all 13 CPU tests passed, including both reproduced review/serialization failures. Diff check passed with cr-at-eol (the repository's existing __init__.py uses CRLF).
- Finishing: keep isolated branch and worktree for review; no push, merge, installation or publication, as specified in approved scope.
- Follow-up: user authorized pushing; signed commit ca391d6 pushed to origin/codex/switch-any-if-empty and verified by matching remote SHA. No tests were rerun for publication.
- Boolean-output follow-up: append `is_empty` BOOLEAN at output slot 1, preserving the existing value at slot 0. Add schema and result assertions for empty, nonempty, zero, false and disconnected selected branches. Tests written but not executed: user requires explicit approval for file execution. Earlier 13-test result predates this follow-up.
- Autogrow failure follow-up: the supplied BatchImagesNode traceback exposes a missing coverage case. Native V3 build_nested_inputs iterates dynamic_paths and recreates a deleted argument as None. Re-finalize dynamic metadata with explicitly omitted sockets absent, preserving other metadata and native empty-group defaults. Add a regression comparing native disconnected sockets against EMPTY for populated and wholly empty groups, and checking ordinary None remains present. Source inspection only; regression and boolean follow-up tests have not been executed under the user's execution restriction.
