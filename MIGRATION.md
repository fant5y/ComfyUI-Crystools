# Native ComfyUI V3 migration

Targets: ComfyUI **0.38.0** and ComfyUI_frontend **1.53.10**.

## Python

- Register all 29 nodes through `ComfyExtension.get_node_list()` and
  `comfy_entrypoint()`; the legacy node mapping is removed.
- Each node declares a native `io.Schema`, executes through a class method and
  returns `io.NodeOutput`. Existing node IDs, display names, input order,
  defaults, output names, categories and list-output nesting are retained.
- Replace the wildcard string-equality workaround with `io.AnyType`.
  Preserve JSON, METADATA_RAW, ListString and CPipeAny socket types using
  `io.Custom`.
  Correct the malformed nested wildcard type declaration on List of any,
  retaining its existing list-output nesting.
- Obtain prompt, workflow metadata and node IDs through the V3 execution
  clone's `cls.hidden`. Keep hidden arguments out of execution signatures.
- Preserve preview state per node ID and preview type across execution clones.
  The cached metadata/text remains in memory until the server process exits.
- Delegate saving to ComfyUI's existing `SaveImage` and `PreviewImage` helpers,
  using `folder_paths` for their directories. Remove the unused global
  `sys.path` modification.
- Preserve image validation and content hashing through `validate_inputs`
  and `fingerprint_inputs`. JSON-file reads now invalidate the cache on
  every run, so editing the file is visible without changing its path.
- Request only the missing selected input in lazy switches.
- Handle omitted optional debugger controls and absent workflow metadata.
  Repair the WebP EXIF helper's prompt/metadata return contract while retaining
  file information.
- Keep monitoring endpoints and hardware collection unchanged.

## Frontend

- Keep `WEB_DIRECTORY = "./web"` and the standard app/API/widget imports.
  The supplied server discovers these JavaScript files and serves them under
  the extension's actual directory name.
- Remove the deprecated `scripts/ui/components/buttonGroup.js` import and
  the unused internal `scripts/utils.js` import.
- Register a **Crystools** sidebar tab through
  `app.extensionManager.registerSidebarTab`. Hardware monitors and execution
  progress appear together in this tab. This replaces their old toolbar/menu
  placement; it is a visible UI change.
- Register existing settings through `ComfyExtension.settings`, retaining
  their IDs and saved values, including dynamically discovered GPU controls.
- Construct the monitor UI before registering settings, whose change callbacks
  can run immediately.
- Load CSS relative to `import.meta.url`, so renamed installation folders
  and deployments under a URL prefix work.
- Observe monitor size changes when the sidebar is mounted or resized.
  Preserve progress clicks that center the current root-graph node and handle
  execution completion, including cached runs.
- Update the committed JavaScript and declarations together with TypeScript.

## Validation

- `npm ci` and `npm run validate`: TypeScript compilation and ESLint passed.
- All 29 native classes passed the actual ComfyUI 0.38.0 V3 class/schema
  validator. Contract comparisons against the repository's original classes
  confirmed input order/types/defaults, output types/names, categories,
  list flags and output-node flags.
- Execution checks covered primitives, lazy branches, lists, pipes, debugger
  output, JSON extraction/file refresh, metadata comparison, preview isolation
  across class clones, image validation and WebP EXIF parsing.
- PNG saving, metadata inclusion/exclusion, image loading, preview and
  resolution were exercised with ComfyUI 0.38.0's actual image-save helpers
  and CPU tensor fixtures.
- A DOM/module harness checked frontend imports, sidebar registration,
  initial settings callbacks, GPU discovery, telemetry rendering, progress
  updates, node centering, sidebar remounting and CSS URLs for a renamed folder
  under a URL prefix.

These are isolated API/behavior checks. GPU tensor operations and the running
ComfyUI server/frontend were not available for a full live-session test.
The validation harnesses and pinned upstream source fixtures are in the
adjacent work directory; they are not production dependencies.

## References

- [ComfyUI 0.38.0 node loader](https://github.com/Comfy-Org/ComfyUI/blob/v0.38.0/nodes.py)
- [ComfyUI 0.38.0 native V3 API](https://github.com/Comfy-Org/ComfyUI/blob/v0.38.0/comfy_api/latest/_io.py)
- [Frontend 1.53.10 extension interfaces](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.53.10/src/types/extensionTypes.ts)
- [Frontend 1.53.10 extension registration](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.53.10/src/services/extensionService.ts)
- [Frontend 1.53.10 settings API](https://github.com/Comfy-Org/ComfyUI_frontend/blob/v1.53.10/src/scripts/ui/settings.ts)
