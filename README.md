# comfyui-crystools [![Donate](https://img.shields.io/badge/Donate-PayPal-blue.svg)](https://paypal.me/crystian77) <a src="https://colab.research.google.com/assets/colab-badge.svg" href="https://colab.research.google.com/drive/1xiTiPmZkcIqNOsLQPO1UNCdJZqgK3U5k?usp=sharing"><img src="https://colab.research.google.com/assets/colab-badge.svg" alt="Open in Colab"></a>

**_🪛 A powerful set of tools for your belt when you work with ComfyUI 🪛_**

With this suit, you can see the resources monitor, progress bar & time elapsed, metadata and compare between two images, compare between two JSONs, show any value to console/display, pipes, and more!
This provides better nodes to load/save images, previews, etc, and see "hidden" data without loading a new workflow.

## Credits and this fork

Crystools was created by [Crystian](https://github.com/crystian). The original
[ComfyUI-Crystools](https://github.com/crystian/ComfyUI-Crystools) provides the node
collection, monitoring, image metadata tools and pipe functionality this fork
builds on. Please support the original author through the donation link above.

This repository is maintained by [fant5y](https://github.com/fant5y), based on
[Willie169's fork](https://github.com/Willie169/ComfyUI-Crystools). Credit for the
original work and earlier community contributions remains with their authors;
the original documentation, examples, license and changelog are retained below.

## Compatibility and fork updates

This fork targets **ComfyUI 0.38.0** and **ComfyUI_frontend 1.53.10**. Its 30 Python
nodes use ComfyUI's native V3 custom-node API. The original node identifiers and
workflow inputs remain supported, with the pipe extensions described below.
Older ComfyUI versions without the required V3 API are not supported by this fork.

Changes in this fork:

- Migrate the original nodes to native V3 registration, schemas and execution;
  preserve image metadata, previews, primitive values, lists and boolean switches.
- Update frontend imports and settings registration. Keep resource monitors and
  progress alongside the top toolbar's extension buttons, including after toolbar
  remounts, and fix the startup `Unknown message type crystools.monitor` warning.
- Expand pipes automatically up to **100 values**, displaying connected source
  labels, socket types and colors through pipe chains and native subgraphs.
- Label pipe outputs with their enclosing group's name, and restore the previous
  label when the node leaves the group.
- Add **Switch Any (Auto)**: choose the first usable input without a boolean or
  numbered selector, with expanding inputs and automatic labels/colors.
- Route named pipe fields through automatic switches. The first-connected pipe
  supplies a stable template for empty sibling slots; selected values are matched
  by label and type even when another pipe connects them in a different order.
- Skip empty whole pipes during automatic selection. Missing extracted fields
  return `None` so availability checks can run; pipe edits preserve existing
  values when an override or its required upstream pipe field is empty.
- Isolate preview state per node, repair WebP metadata handling and make JSON-file
  changes visible without changing the file path.

See [Pipe](#pipe) and [Switch Any (Auto)](#node-switch-any-auto) for usage, and
[MIGRATION.md](./MIGRATION.md) for implementation details and validation.
Screenshots and sample workflows below also document the original Crystools;
the current toolbar and expanded sockets may look different.

![Show metadata](./docs/jake.gif)

# Table of contents

- [Credits and this fork](#credits-and-this-fork)
- [Compatibility and fork updates](#compatibility-and-fork-updates)
- [General](#general)
- [Metadata](#metadata)
- [Debugger](#debugger)
- [Image](#image)
- [Pipe](#pipe)
- [Utils](#utils)
- [Primitives](#primitives)
- [List](#list)
- [Switch](#switch)
- Others: [About](#about), [To do](#to-do), [Changelog](#changelog), [Installation](#installation), [Use](#use)

---

## General

### Resources monitor

**🎉Finally, you can see the resources used by ComfyUI (CPU, GPU, RAM, VRAM, GPU Temp and space) on the menu in real-time!**

Horizontal:  
![Monitors](./docs/monitor1.webp)

Vertical:  
![Monitors](./docs/monitor3.webp)

Now you can identify the bottlenecks in your workflow and know when it's time to restart the server, unload models or even close some tabs!

You can configure the refresh rate which resources to show:

![Monitors](./docs/monitor-settings.png)

> **Notes:**
> - The GPU data is only available when you use CUDA (only NVIDIA cards, sorry AMD users).
> - This fork targets ComfyUI 0.38.0 and ComfyUI_frontend 1.53.10.
> - The cost of the monitor is low (0.1 to 0.5% of utilization), you can disable it from settings (`Refres rate` to `0`).
> - Data comes from these libraries:
>   - [psutil](https://pypi.org/project/psutil/)
>   - [torch](https://pytorch.org/)
>   - [nvidia-ml-py](https://pypi.org/project/nvidia-ml-py/) (official NVIDIA bindings)


### Progress bar

You can see the progress of your workflow with a progress bar on the menu!

![Progress bar](./docs/progress-bar.png)

https://github.com/crystian/comfyui-crystools/assets/3886806/35cc1257-2199-4b85-936e-2e31d892959c

Additionally, it shows the time elapsed at the end of the workflow, and you can `click` on it to see the **current working node.** 

> **Notes:**
> - If you don't want to see it, you can turn it off from settings (`Show progress bar in menu`)


## Metadata

### Node: Metadata extractor

This node is used to extract the metadata from the image and handle it as a JSON source for other nodes.  
You can see **all information**, even metadata from other sources (like Photoshop, see sample).

The input comes from the [load image with metadata](#node-load-image-with-metadata) or [preview from image](#node-preview-from-image) nodes (and others in the future).

![Metadata extractor](./docs/metadata-extractor.png)

**Sample:** [metadata-extractor.json](./samples/metadata-extractor.json)

><details>
>  <summary>Other metadata sample (photoshop)</summary>
> 
> With metadata from Photoshop
![Metadata extractor](./docs/metadata-extractor-photoshop.png)
></details>

><details>
>  <summary><i>Parameters</i></summary>
>
> - input: 
>   - metadata_raw: The metadata raw from the image or preview node
> - Output:
>   - prompt: The prompt used to produce the image.
>   - workflow: The workflow used to produce the image (all information about nodes, values, etc).
>   - file info: The file info of the image/metadata (resolution, size, etc) is human readable.
>   - raw to JSON: The entire metadata is raw but formatted/readable.
>   - raw to property: The entire metadata is raw in "properties" format.
>   - raw to csv: The entire metadata is raw in "csv" format.
></details>

<br />

### Node: Metadata comparator

This node is so useful for comparing two metadata and seeing the differences (**the main reason why I created this extension!**)

You can compare 3 inputs: "Prompt", "Workflow" and "Fileinfo"

There are three potential "outputs": `values_changed`, `dictionary_item_added`, and `dictionary_item_removed` (in this order of priority).

![Metadata extractor](./docs/metadata-comparator.png)

**Sample:** [metadata-comparator.json](./samples/metadata-comparator.json)

**Notes:**  
- I use [DeepDiff](https://pypi.org/project/deepdiff) for that. For more info check the link.  
- If you want to compare two JSONs, you can use the [JSON comparator](#node-JSON-comparator) node.


><details>
>  <summary><i>Parameters</i></summary>
>
> - options:
>   - what: What to compare, you can choose between "Prompt", "Workflow" and "Fileinfo"  
> - input: 
>   - metadata_raw_old: The metadata raw to start comparing
>   - metadata_raw_new: The metadata raw to compare
> - Output:
> - diff: This is the same output you can see in the display of the node; you can use it on other nodes.
></details>

<br />

---

## Debugger

### Node: Show Metadata

With this node, you will be able to see the JSON produced from your entire prompt and workflow so that you can know all the values (and more) of your prompt quickly without opening the file (PNG or JSON).

![Show metadata](./docs/debugger-show-metadata.png)

**Sample:** [debugger-metadata.json](./samples/debugger-metadata.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Options:
>   - Active: Enable/disable the node  
>   - Parsed: Show the parsed JSON or plain text  
>   - What: Show the prompt or workflow (prompt are values to produce the image, and workflow is the entire workflow of ComfyUI)
></details>

<br /> 

### Node: Show any

You can see on the console or display any text or data from the nodes. Connect it to what you want to inspect, and you will see it.

![Show any](./docs/debugger-show-any.png)

**Sample:** [debugger-any.json](./samples/debugger-any.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Input:
>   - any_value: Any value to show, which can be a string, number, etc.
> - Options:
>   - Console: Enable/disable write to console  
>   - Display: Enable/disable write on this node  
>   - Prefix: Prefix to console
></details>

<br />

### Node: Show any to JSON

It is the same as the previous one, but it formatted the value to JSON (only display).

![Show any](./docs/debugger-show-json.png)

**Sample:** [debugger-json.json](./samples/debugger-json.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Input:
>   - any_value: Any value to try to convert to JSON
> - Output:
>   - string: The same string is shown on the display
></details>

<br />

---

## Image

### Node: Load image with metadata
This node is the same as the default one, but it adds three features: Prompt, Metadata, and supports **subfolders** of the "input" folder.

![Load image with metadata](./docs/image-load.png)

**Sample:** [image-load.json](./samples/image-load.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Input:
>   - image: Read the images from the input folder (and subfolder) (you can drop the image here or even paste an image from the clipboard)
> - Output:
>   - Image/Mask: The same as the default node  
>   - Prompt: The prompt used to produce the image (not the workflow)  
>   - Metadata RAW: The metadata raw of the image (full workflow) as string
></details>

**Note:** The subfolders support inspired on: [comfyui-imagesubfolders](https://github.com/catscandrive/comfyui-imagesubfolders)

<br />

### Node: Save image with extra metadata
This node is the same as the default one, but it adds two features: Save the workflow in the png or not, and you can add any piece of metadata (as JSON).

This saves custom data on the image, so you can share it with others, and they can see the workflow and metadata (see [preview from metadata](#node-preview-from-metadata)), even your custom data.

It can be any type of information that supports text and JSON.

![Save image with extra metadata](./docs/image-save.png)

**Sample:** [image-save.json](./samples/image-save.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - options:
>   - with_workflow: If you want to save into the image workflow (special to share the workflow with others)
> - Input:
>   - image: The image to save (same as the default node)
> - Output:
>   - Metadata RAW: The metadata raw of the image (full workflow) as string
></details>

**Note:** The data is saved as special "exif" (as ComfyUI does) in the png file; you can read it with [Load image with metadata](#node-load-image-with-metadata).

> **Important:**
> - If you want to save your workflow with a particular name and your data as creator, you need to use the [ComfyUI-Crystools-save](https://github.com/crystian/ComfyUI-Crystools-save) extension; try it!
![Crystools-save](./docs/crystools-save.png)


<br />

### Node: Preview from image

This node is used to preview the image with the **current prompt** and additional features.  

![Preview from image](./docs/image-preview.png)

**Feature:** It supports cache (shows as "CACHED") (not permanent yet!), so you can disconnect the node and still see the image and data, so you can use it to compare with others!

![Preview from image](./docs/image-preview-diff.png)

As you can see the seed, steps, and cfg were changed

**Sample:** [image-preview-image.json](./samples/image-preview-image.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Input:
>   - image: Any kind of image link
> - Output:
>   - Metadata RAW: The metadata raw of the image and full workflow.  
>     - You can use it to **compare with others** (see [metadata comparator](#node-metadata-comparator))
>     - The file info like filename, resolution, datetime and size with **the current prompt, not the original one!** (see important note)
></details>

> **Important:**
> - If you want to read the metadata of the image, you need to use the [load image with metadata](#node-load-image-with-metadata) and use the output "metadata RAW" not the image link.
> - To do a preview, it is necessary to save it first on the temporal folder, and the data shown is from the temporal image, **not the original one** even **the prompt!**

<br />

### Node: Preview from metadata

This node is used to preview the image from the metadata and shows additional data (all around this one).  
It supports the same features as [preview from image](#node-preview-from-image) (cache, metadata raw, etc.). But the important difference is you see **real data from the image** (not the temporal one or the current prompt).
 
![Preview from metadata](./docs/image-preview-metadata.png)

**Sample:** [image-preview-metadata.json](./samples/image-preview-metadata.json)

<br />

### Node: Show resolution

This node is used to show the resolution of an image.

> Can be used with any image link.

![Show resolution](./docs/image-resolution.png)

**Sample:** [image-resolution.json](./samples/image-resolution.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Input:
>   - image: Any kind of image link
> - Output:
>   - Width: The width of the image  
>   - Height: The height of the image
></details>

<br />

---

## Pipe

### Nodes: Pipe to/edit any, Pipe from any

This powerful set of nodes is used to better organize your pipes.  

The "Pipe to/edit any" node is used to encapsulate multiple links into a single one. It includes support for editing and easily adding the modified content back to the same pipe number.

The "Pipe from any" node is used to extract the content of a pipe.  

### Expanded pipes in this fork

Pipes start with six value slots and add a spare input as needed, up to 100 values.
Connected slots show the source output's label and color. Labels propagate across
reroutes, chained pipes and native subgraph boundaries. An edit replaces its value
at that position; disconnecting it restores the inherited value and label.

The pipe output uses the smallest enclosing canvas group's title. Outside groups,
an explicit local label wins; otherwise intermediate pipes inherit the upstream
bundle name. Shared subgraphs display names for the instance currently opened.

When several pipes feed **Switch Any (Auto)**, the first-connected pipe supplies
the template, regardless of its muted/bypassed state. Empty input slots on sibling
pipes inherit its labels and colors. Connected slots keep their actual source
identity. The template's order stays fixed when another branch is activated;
fields unique to other branches are appended to the common layout. Template names
travel through intermediate extractors, editors, reroutes and nested switches.
A nearer switch supplies its local template; outer templates fill remaining gaps.
An already connected field is not duplicated just to fill a template hint.

For example, MODEL may occupy slot 1 on one pipe and slot 3 on another: the switch
matches its source label and type and routes the selected MODEL to the same
extraction output. Repeated identical labels/types are matched in occurrence
order, including empty occurrences. An empty middle IMAGE does not move the next
IMAGE into its place. Give semantically different values distinct source output labels when
both their label and type would otherwise be identical.

An empty whole pipe can be skipped by the automatic switch. Extracting an absent
or empty field into another **Pipe to/edit any** leaves that edit input unused:
the inherited value stays in place, or the slot remains empty if it had no value.
Other fields and later overrides continue through the pipe without extra switch
nodes. Values never shift to fill an empty slot.

When an edit can retain a differently named field, the switch reserves both
identities and routes the actual value to the corresponding output. Before the
switch, an extractor shows both possible names separated by `/`; if their types
differ, its socket remains a wildcard. Empty overrides retain their original
identity through extraction and repacking.

Extracted empty fields return ordinary `None`, allowing nodes such as If None
to inspect them. False, zero and nonempty tensors remain valid values.

Pipe edits evaluate overrides lazily. If an override's upstream processing branch
requires a typed field extracted from an empty pipe slot, the editor leaves that
override unused and preserves the original value. For example, an absent reference
image does not run scaling/encoding solely for a conditioning override; the
original conditioning stays in the pipe. Wildcard checks and lazy inputs retain
their own missing-value handling.

This protection applies to branches requested by the pipe editor. Other output
nodes can independently request those same branches, and ordinary consumers must
handle `None` themselves. ComfyUI's subgraph input requirements remain unchanged.
Ordinary pipe editing remains positional; direct API pipes without workflow field
metadata also retain positional behavior.

The screenshots below show the original six-slot pipes.
 
Typical example:

![Pipes](./docs/pipe-0.png)

With pipes:

![Pipes](./docs/pipe-1.png)

**Sample:** [pipe-1.json](./samples/pipe-1.json)

Editing pipes:

![Pipes](./docs/pipe-2.png)

**Sample:** [pipe-2.json](./samples/pipe-2.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Input:
>   - CPipeAny: This is the type of this pipe you can use to edit (see the sample)
>   - any_*: Automatically expanding value inputs, up to 100
> - Output:
>   - CPipeAny: You can continue the pipe with this output; you can use it to bifurcate the pipe (see the sample)
></details>

>**Important:**
> - Direct pipe edits use positions. Automatic switches can align named pipe fields as described above; this does not convert values or make different data types interchangeable.
> - "RecursionError" It's crucial to note that the flow of links **must be in the same direction**, and they cannot be mixed with other flows that use the result of this one. Otherwise, this may lead to recursion and block the server (you need to restart it!)


><details>
>  <summary><i>Bad example with "RecursionError: maximum recursion depth exceeded"</i></summary>
>
> If you see something like this on your console, you need to check your pipes. That is bad sample of pipes, you can't mix the flows.
![Pipes](./docs/pipe-3.png)
></details>

<br />

---

## Utils

Some useful nodes to use in your workflow.

### Node: JSON comparator

This node is so useful to compare two JSONs and see the differences.

![JSON comparator](./docs/utils-json-comparator.png)

**Sample:** [utils-json-comparator.json](./samples/utils-json-comparator.json)


><details>
>  <summary><i>Parameters</i></summary>
>
> - input: 
>   - json_old: The first JSON to start compare
>   - json_new: The JSON to compare
> - Output:
>   - diff: A new JSON with the differences
></details>


**Notes:**  
As you can see, it is the same as the [metadata comparator](#node-metadata-comparator) but with JSONs.  
The other is intentionally simple to compare two images metadata; this is more generic.  
The main difference is that you can compare any JSON, not only metadata.

<br />

### Node: Stats system

This node is used to show the system stats (RAM, VRAM, and Space).  
It **should** connect as a pipe.

![JSON comparator](./docs/utils-stats.png)

**Sample:** [utils-stats.json](./samples/utils-stats.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - input: 
>   - latent: The latent to use to measure the stats
> - Output:
>   - latent: Return the same latent to continue the pipe
></details>

**Notes:** The original is in [WAS](https://github.com/WASasquatch/was-node-suite-comfyui), I only show it on the display.

<br />

---

## Primitives

### Nodes: Primitive boolean, Primitive integer, Primitive float, Primitive string, Primitive string multiline

A set of nodes with primitive values to use in your prompts.

![Primitives](./docs/primitives.png)

<br />

---

## List
A set of nodes with a list of values (any or strings/texts) for any proposal (news nodes to use it coming soon!).

> **Important:** You can use other nodes like "Show any" to see the values of the list

### Node: List of strings

**Feature:** You can concatenate them.

![Lists](./docs/list-string.png)

**Sample:** [list-strings.json](./samples/list-strings.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Input:
>   - string_*: 8 possible inputs to use
>   - delimiter: Use to concatenate the values on the output
> - Output:
>   - concatenated: A string with all values concatenated
>   - list_string: The list of strings (only with values)
></details>

<br />

### Node: List of any

You can concatenate any value (it will try to convert it to a string and show the value), so it is util to see several values at the same time.

![Lists](./docs/list-any.png)

**Sample:** [list-any.json](./samples/list-any.json)

><details>
>  <summary><i>Parameters</i></summary>
>
> - Input:
>   - any_*: 8 possible inputs to use
> - Output:
>   - list_any: The list of any elements (only with values)
></details>

<br />

---

## Switch
A set of nodes to switch between flows.  

The original boolean switches remain available; use them to select a flow explicitly.
You have predefined switches (string, latent, image, conditioning) but you can use "Switch any" for any value/type.

![Switches](./docs/switches.png)

**Sample:** [switch.json](./samples/switch.json)

### Node: Switch Any (Auto)

**Switch Any (Auto)** selects the first usable connected input from top to bottom,
without a boolean or numbered selector. It starts with two inputs and adds a spare
as connections are made, up to 100. It accepts any value type, including pipes.

- Skip `None`, whitespace-only strings, empty containers/bytes, tensors with no
  elements, and Crystools pipes containing no usable values.
- Keep `False`, `0` and black images as valid values.
- Skip sources that were muted or bypassed in the submitted workflow, including
  across native subgraph boundaries.
- Evaluate candidates lazily in input order; stop requesting branches once a
  usable value is found. Muted/bypassed branches are not requested.
- If nothing is available, return ordinary `None` so a following switch or
  availability check can still execute.
- Show the first non-muted/non-bypassed input's label and color on the output,
  updating when branch modes change. Use a specific socket type when connected
  branches agree; otherwise keep a wildcard output. The label reflects graph
  activation; runtime empty values are discovered when the workflow executes.

For model groups/subgraphs, connect each configured group's pipe to this switch,
then connect its output to **Pipe from any**. Connect the intended template pipe
first, and activate the desired group while muting/bypassing the others. The saved
template survives workflow reloads and activation changes; disconnecting it
promotes the next remaining connection. Older workflows without saved connection
order initialize the template from input slot order.

This is a standalone switch for images, models, conditioning, text, numbers or
any other value; pipes are optional. A usable fallback passes through without
running later branches. An evaluated empty input advances selection to the next
candidate. Independently requested output nodes can still run those branches.

The switch does not swallow errors from a candidate it actually needs to evaluate,
or override native execution blockers emitted by other nodes. If every candidate
is empty, consumers requiring a real image/model still need a valid source;
returning None lets None-aware consumers and downstream fallback switches run.

The node identifier is `CSWITCH_ANY_AUTO`. Workflows made with the early
`First available any` prototype need that node replaced with **Switch Any (Auto)**.

<br />

---

## About

**Notes from the author:**
- This is my first project in python ¯\\_(ツ)_/¯ (PR are welcome!)
- I'm a software engineer but in other languages (web technologies)
- My Instagram is: https://www.instagram.com/crystian.ia I'll publish my works on it, so consider following me for news! :)
- I'm not a native English speaker, so sorry for my English :P

---

## To do
- [ ] Several unit tests
- [ ] Add permanent cache for preview/metadata image (to survive to F5! or restart the server)

---

## Changelog

Format: version (DD/MM/YYYY)

### Crystools

### This fork: native V3 migration and workflow routing

- Update for ComfyUI 0.38.0 / ComfyUI_frontend 1.53.10; preserve the original node collection.
- Restore toolbar monitoring/progress and fix monitor startup events.
- Add expandable pipes, group/source labels, socket colors and native subgraph traversal.
- Add Switch Any (Auto), stable sibling templates, named field alignment and active output labels.
- Handle empty pipes and absent extracted fields without passing unusable values downstream.
- Preserve attribution and original release history. Details: [MIGRATION.md](./MIGRATION.md).

### 1.28.0 (05/09/2026)

- Forked by [Willie169](https://github.com/Willie169) to current repo.
- Merged [Fixed annoying errors due to my own ZLUDA PR.](https://github.com/crystian/ComfyUI-Crystools/pull/234) by [sfinktah](https://github.com/sfinktah).
- Merged [feat: add AMD Linux GPU monitoring support (pyamdgpuinfo/sysfs fallback)](https://github.com/crystian/ComfyUI-Crystools/pull/278) by [ProOrNoob](https://github.com/ProOrNoob).
- Merged [Use nvidia-ml-py instead of pynvml](https://github.com/crystian/ComfyUI-Crystools/pull/282) by [EuropaYou](https://github.com/EuropaYou).
- Merged layout part of [Fix: ROCm/RDNA3.5 GPU monitoring widgets (usage, VRAM, temperature) + responsive layout](https://github.com/crystian/ComfyUI-Crystools/pull/283) by [MISEMUNJIOZONE](https://github.com/MISEMUNJIOZONE).

### 1.27.0 (17/08/2025)
- revert the lower case on name, cannot change on registry ¯\_(ツ)_/¯
- zluda check removed, it is not necessary anymore

### 1.25.3 (27/07/2025)
- change the name to lower case

### 1.25.1 (02/06/2025)
- fix issues with switches on settings menu
- node: "Switch from any" added
- load image with metadata: filtered (exclude hidden folders an typically metadata files)
- other fixes

### 1.24.0 (02/06/2025)
- PRs by community merged
- Improved VRAM usage/readout
- HDD error handling
- Lazy switches

### 1.23.0 (02/06/2025)
- Jetson support added by @johnnynunez
- some ui fixes

### 1.20.0 (21/10/2024)
- BETA of JSON file reader and extractor, to allow you to read your own JSON files and extract the values to use in your workflow 

### 1.19.0 (06/10/2024)
- HORIZONTAL UI! New version is ready! 🎉

### 1.18.0 (21/09/2024)
- HORIZONTAL UI! 🎉
- Configurable size of monitors on settings menu

### 1.17.0 (21/09/2024)
- Settings menu reorganized
- Preparing for horizontal UI
- Update from ComfyUI (typescript and new features)

### 1.16.0 (31/07/2024)
- Rollback of AMD support by manager does not support other repository parameter (https://test.pypi.org/simple by pyrsmi)

### 1.15.0 (21/07/2024)
- AMD Branch merged to the main branch, should work for AMD users on **Linux**

### 1.14.0 (15/07/2024)
- Tried to use AMD info, but it breaks installation on windows, so I removed it ¯\_(ツ)_/¯
- AMD Branch added, if you use AMD and Linux, you can try it (not tested for me)

### 1.13.0 (01/07/2024)
- Integrate with new ecosystem of ComfyUI
- Webp support added on load image with metadata node

### 1.12.0 (27/03/2024)
- GPU Temperature added

### 1.10.0 (17/01/2024)
- Multi-gpu added

### 1.9.2 (15/01/2024)
- Big refactor on hardwareInfo and monitor.ts, gpu was separated on another file, preparing for multi-gpu support

### 1.8.0 (14/01/2024) - internal
- HDD monitor selector on settings

### 1.7.0 (11/01/2024) - internal
- Typescript added!

### 1.6.0 (11/01/2024)
- Fix issue [#7](https://github.com/crystian/comfyui-crystools/issues/7) to the thread deadlock on concurrency

### 1.5.0 (10/01/2024)
- Improvements on the resources monitor and how handle the threads
- Some fixes 

### 1.3.0 (08/01/2024)
- Added in general Resources monitor (CPU, GPU, RAM, VRAM, and space)
- Added this icon to identify this set of tools: 🪛 

### 1.2.0 (05/01/2024)
- progress bar added
 
### 1.1.0 (29/12/2023)
- Node added: "Save image with extra metadata"
- Support to **read** Jpeg metadata added (not save)

### 1.0.0 (26/12/2023)
- First release


### Crystools-save - DEPRECATED (01/06/2025)

### 1.1.0 (07/01/2024)
- Labeling updated according to the new version of Crystools (this project)

### 1.0.0 (29/12/2023)
- Created another extension to save the info about the author on workflow: [ComfyUI-Crystools-save](https://github.com/crystian/ComfyUI-Crystools-save)

---

## Installation

### Install from GitHub
1. Install [ComfyUI](https://github.com/Comfy-Org/ComfyUI) with the compatible versions listed above.
2. Clone this repo into `custom_nodes`:
    ```
    cd ComfyUI/custom_nodes
    git clone https://github.com/fant5y/ComfyUI-Crystools.git
    cd ComfyUI-Crystools
    pip install -r requirements.txt
    ```
3. Start ComfyUI and refresh the browser. After updates, restart ComfyUI and use Ctrl+F5.

Use the Python environment that runs your ComfyUI installation when installing
dependencies. Install one copy of Crystools at a time to avoid duplicate node IDs.

### Install from manager

The original Crystools is available through [ComfyUI-Manager](https://github.com/ltdrdata/ComfyUI-Manager.git). To get the changes documented here, install this fork from its GitHub URL using the instructions above.

### Using on Google Colab

You can use it on Google Colab, but you need to install it manually:

[Google Colab](https://colab.research.google.com/drive/1xiTiPmZkcIqNOsLQPO1UNCdJZqgK3U5k?usp=sharing)

* Run the first cell to install ComfyUI and launch the server
* After it finishes, use the link to open the a new tab, looking a line like this:
```
This is the URL to access ComfyUI: https://identifying-complications-fw-some.trycloudflare.com    
```

---

## Use

You can use it as any other node, just using the menu in the category `crystools` or double clicking on the canvas (I recommended using the "oo" to fast filter), the original node identifiers end with `[Crystools]`. Search for `Switch Any (Auto)` to find the new automatic switch.

![Menu](./docs/menu.png)
![shortcut](./docs/shortcut.png)

If for some reason you need to see the logs, you can define the environment variable `CRYSTOOLS_LOGLEVEL` and set the [value](https://docs.python.org/es/3/howto/logging.html).

---

Made with ❤️ by [Crystian](https://github.com/crystian).
