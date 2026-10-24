# Runtime bypass on an empty selected branch

The user explicitly requested proceeding with implementation, keeping the workflow wired and bypassing processing when its driving value is absent. This extends the earlier omission-only contract.

Add an `empty_action` choice to Switch Any (If Empty): `omit` retains existing behavior and remains the default for compatibility; `bypass` emits a distinct serializable BYPASS marker. Either selected branch may be disconnected. Both markers count as empty when checked by this switch.

When a receiver has a BYPASS-marked input, Crystools skips that receiver's processing function and lazy-status function. For each output, prefer a compatible input at the corresponding schema position, otherwise the first exactly matching input, otherwise a wildcard-compatible input. As with native frontend bypass, mapping is by declared socket type and position, not semantic inference. A missing, None, or BYPASS-marked mapped input produces BYPASS at that output. A type-changing node without a compatible input therefore propagates absence until a later node can pass a compatible main-flow input through. A terminal output node with no outputs performs no side effects.

This is an execution-time equivalent implemented entirely in Crystools. It does not change canvas modes or wires, require rgthree, emit ExecutionBlocker, or suppress ordinary upstream exceptions. Upstream eager dependencies may still execute; bypass does not mean pruning the entire upstream graph. Ambiguous same-type inputs use deterministic socket order. List execution streams must be entirely marked or entirely real for a given bypass input; mixed streams remain unsupported and reject explicitly.

The representative T2I route is absent image -> skip image processing -> skip IMAGE-to-LATENT processing -> skip reference-conditioning processing while passing the incoming CONDITIONING through. A standalone image-preview path with no image performs no preview. Other data types use the same rule.

Read-only evidence: installed K:/execution.py get_input_data, _async_map_node_over_list, merge_result_data and get_output_from_returns; native frontend src/lib/litegraph/src/subgraph/ExecutableNodeDTO.ts resolveOutput/_getBypassSlotIndex at upstream commit 1a6324c76d49fe9e129ee378edd40587b73545d3. Backend schema ordering and wildcard matching are approximations of frontend socket metadata, so exact UI parity is not claimed.

No tests, imports, ComfyUI launches, CPU jobs, or GPU jobs may execute without the user's explicit approval. Changes remain unverified at runtime until that approval is obtained.
