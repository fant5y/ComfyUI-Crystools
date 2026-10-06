# Native ComfyUI V3 migration

Targets: ComfyUI **0.38.0** and ComfyUI_frontend **1.53.10**.

## Python

- Register all 30 nodes through `ComfyExtension.get_node_list()` and
  `comfy_entrypoint()`; the legacy node mapping is removed.
- Each node declares a native `io.Schema`, executes through a class method and
  returns `io.NodeOutput`. Existing node IDs, display names, input order,
  defaults, output names, categories and list-output nesting are retained.
  The pipe nodes now declare additional value slots as described below.
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
- Register an `actionBarButtons` anchor in the top bar alongside extension
  buttons. Mount the hardware monitors and progress beside that anchor and
  restore them when the frontend recreates the toolbar. The frontend exposes
  no custom render hook for this bar; only the extension-owned anchor is
  queried, without importing internal components or selecting Run-button DOM.
- Register existing settings through `ComfyExtension.settings`, retaining
  their IDs and saved values, including dynamically discovered GPU controls.
- Construct the monitor UI before registering settings, whose change callbacks
  can run immediately.
- Load CSS relative to `import.meta.url`, so renamed installation folders
  and deployments under a URL prefix work.
- Register the custom monitor event during module loading, before the frontend
  opens its WebSocket. Retain the latest reading until setup and GPU discovery
  finish, preventing the startup "Unknown message type" warning.
- Observe monitor size changes when the toolbar is mounted or resized.
  Preserve progress clicks that center the current root-graph node and handle
  execution completion, including cached runs.
- Update the committed JavaScript and declarations together with TypeScript.

## Expandable pipes

- Keep the first six value positions and the CPipeAny list payload compatible
  with existing workflows. The pipe schema now supports 100 values; ComfyUI
  requires each output index to be declared for server-side prompt validation.
- Show six slots initially and add a spare input when the last slot is connected.
  Extraction outputs follow the supplied range. Remove only trailing unused
  slots, retaining output indices that still have downstream connections.
- Display each connected source output's label and socket colors. Input names
  remain `any_1`, `any_2`, etc.; labels never change the server's input keys.
  Value inputs stay wildcard sockets so they can be replaced with another type.
- Propagate labels/types/colors through pipe chains, standard reroutes and native
  subgraph input/output boundaries, including nested subgraphs. Resolve exported
  pipes through their internal output links, retaining the host instance context
  when resolving external inputs of shared subgraph definitions. Refresh the root
  graph and its definitions after internal edits, workflow configuration and
  subgraph conversion; preserve existing subgraph connection callbacks.
  An edit overrides its value position; disconnecting it restores the inherited
  label and value. Output link types track the resolved source type.
- Refresh after creation, workflow loading and connection changes, with a cycle
  guard. Existing callbacks are preserved. Additional output positions return
  silent execution blockers when absent, without changing the compact pipe payload.

## Switch Any (Auto)

- Add a separate native V3 switch, retaining the existing boolean switches.
  Start with two wildcard inputs, adding an empty slot as inputs are connected,
  up to 100. Reuse the pipe resolver for connected labels/colors and subgraphs.
- Select the first non-empty input from top to bottom. Skip None, whitespace-only
  strings, empty built-in containers/bytes and tensors with no elements.
  False, zero and black images are valid values; tensor truth testing is avoided.
- Preserve ComfyUI list execution streams and opaque values. If every input is
  unavailable, return a silent execution blocker to stop downstream nodes.
- Use the submitted workflow and the native hidden execution ID to skip sources
  originally muted/bypassed, including subgraph boundaries. This matters because
  the frontend may rewire a bypassed node to its upstream input. No workflow
  metadata is required for ordinary None/empty selection through direct API use.
- Connected active branches are evaluated before selection; this node does not
  lazily execute one candidate at a time. Normal ComfyUI execution blockers and
  upstream errors still propagate according to the engine's execution rules.
- When all connected candidates are pipes, expose a CPipeAny output and propagate
  a common field layout through the switch, downstream extraction/edit pipes,
  reroutes and native subgraphs. Keep the first connected branch's slot order,
  appending fields unique to other branches. Muting/bypassing a branch does not
  change this layout or move connected downstream outputs.
- Carry field identities on a list subclass, preserving the existing list payload
  and positional pipe edits. At selection, reorder the actual values by exact
  source label and type, so MODEL reaches the same output even if another branch
  supplies it in a different slot. Missing fields become None; repeated identical
  labels/types are matched by occurrence order. Give semantically distinct fields
  distinct source labels when they otherwise share the same label and type.
- Preserve connection order in serialized switch properties. The first-connected
  pipe supplies the template even when bypassed/muted; on older workflows without
  saved order, initialize it from input slot order. Disconnection promotes the
  next remaining connection. Empty slots on sibling creation/edit pipes inherit
  the template's labels/colors and expand to its range. Connected slots retain
  their actual identities, and copied placeholders do not add phantom fields to
  the switch layout. Shared subgraph templates retain their instance context.
- Label pipe outputs with the smallest enclosing canvas group's title, using
  native group bounds and node centers. Restore the prior output label on leaving
  the group. Refresh after graph edits and drawing, preserving existing hooks.
- Give automatic switch outputs the first non-muted/non-bypassed input's
  label/colors, checking top to bottom to match execution priority. Track mode
  flags across reroutes and subgraph input/output boundaries. Refresh the display
  after graph edits and during drawing, while keeping the saved template fixed.
  Advertise its type when all connected sources agree; use wildcard for mixed
  or unresolved types. Resolve these descriptions recursively through switches,
  reroutes and subgraphs so receiving pipes see the same source label/type.
- Treat a PipeValues payload containing only unavailable values as empty, so an
  automatic switch can fall through to another pipe. Keep whole empty pipe
  payloads as pipe values rather than upstream execution blockers, which would
  prevent the switch from checking alternatives. Extraction emits silent native
  execution blockers for missing/empty fields and accepts a None pipe safely.
  False, zero and nonempty tensors remain valid. A blocked field stops its
  dependent path, even when connected to an optional socket; native blockers
  entering a switch still propagate under the engine's rules.
- Store layouts in native serialized node properties, including layouts for each
  instance of a shared subgraph. Pipe creation and automatic selection use native
  fingerprint invalidation because hidden workflow metadata is excluded from the
  engine's input cache key. These lightweight nodes re-run to reflect label and
  activation changes; upstream model nodes retain their normal caching behavior.
  Unnamed direct API pipes retain positional behavior. No model-specific fields
  or input selectors are introduced.

## Validation

- `npm ci` and `npm run validate`: TypeScript compilation and ESLint passed.
- All 30 native classes passed the actual ComfyUI 0.38.0 V3 class/schema
  validator. Contract comparisons against the repository's original classes
  confirmed input order/types/defaults, output types/names, categories,
  list flags and output-node flags.
- First-available checks covered None/empty inputs, False/zero, empty tensors,
  list streams, silent all-empty output and muted/bypassed sources in root and
  subgraph workflows. The real 0.38.0 execution mapper/merger passed selection
  and all-empty checks with native V3 class locking.
- Pipe checks covered 100-value execution, sparse slots, non-mutating edits,
  label/color propagation, automatic growth, disconnects, connected-index
  retention and metadata cycles. Subgraph cases covered exported pipes, nested
  input/output forwarding, internal edits, workflow configuration events and
  distinct inputs on shared subgraph instances.
- Named-switch checks covered reordered payloads, missing/extra fields, duplicate
  names, unchanged source payloads, chained switches/edit pipes, mixed ordinary
  values, per-instance subgraph layouts and actual V3 execution list streams.
- Template/display checks covered connection chronology distinct from socket
  order, configuration reloads, bypassed templates, connected-slot identity,
  nested groups, title changes, restoration outside groups and typed/mixed
  switch outputs. Native mapper checks verified empty-pipe fallback and that
  consumers of absent extracted fields do not execute.
- Active output-label checks covered input priority distinct from connection
  chronology, live mute/bypass toggles, downstream labels/colors, subgraph hosts,
  reroutes and unchanged template layouts when no branch is active.
- Execution checks covered primitives, lazy branches, lists, pipes, debugger
  output, JSON extraction/file refresh, metadata comparison, preview isolation
  across class clones, image validation and WebP EXIF parsing.
- PNG saving, metadata inclusion/exclusion, image loading, preview and
  resolution were exercised with ComfyUI 0.38.0's actual image-save helpers
  and CPU tensor fixtures.
- A DOM/module harness checked frontend imports, action-bar registration,
  initial settings callbacks, GPU discovery, telemetry rendering, progress
  updates, node centering, toolbar remounting and CSS URLs for a renamed folder
  under a URL prefix. The frontend
  1.53.10 event registration and WebSocket dispatcher were exercised directly,
  including monitor messages arriving before extension setup.

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
