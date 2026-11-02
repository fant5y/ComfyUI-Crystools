# Single-run conditional bypass: manual verification

Automated checks and ComfyUI execution were deliberately not run during this change.
The previous JavaScript fixture exercised preflight jobs, which no longer exist.

On the user's next normal run:

- Select a populated branch: the receiving node operates normally.
- Select a missing branch in bypass mode: the receiver is skipped and its consumers
  receive the connection selected by native ComfyUI bypass routing.
- Include a save/preview receiver as an output: it must not save/preview on bypass.
- Queue twice without changes: there is one job per click; normal cache reuse applies.
- Edit a wire/widget during execution: the submitted run continues; the next run
  uses the edit.
- Include a list stream, chained conditional receivers, and a receiver inside a
  subgraph. Verify all selected stream items continue to the downstream nodes.

Runtime routing is per subgraph instance. A shared subgraph definition has only
one canvas mode: purple is shown only when all recorded instances agree. This
change retains the installed receiver-inside-subgraph behavior; it does not add
whole-subgraph bypass when a switch is wired into a subgraph box.
