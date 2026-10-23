# Workflow and design

FinalDiagrams turns a complete technical document into one editable HTML artifact. Prose, code, images and diagrams remain together; the semantic JSON model lets both a person and an agent make later changes without reconstructing a drawing from pixels.

## The document loop

1. Install the complete plugin, both sibling skills from `finaldiagrams-skills.zip` (or the dedicated `finaldiagrams-copilot-skills.zip` for Copilot CLI), or the base skill alone from `finaldiagrams-skill.zip`, following [installation instructions](agent-installation.md).
2. Ask for the whole document: its audience, purpose, available evidence and desired output. The skill supports design notes, architecture explanations and other technical documents; onboarding is an example rather than a required structure.
3. The agent inspects supplied documents or repository evidence, writes the ordered document blocks and shared entities into JSON, validates references, then exports through the packaged runtime. It marks fictional examples and uncertain interpretations explicitly. A dependency graph alone does not establish a request's execution order.
4. Open the HTML locally. Read the prose, search for concepts, and select diagram nodes, relationships, messages or members for details. Each canvas has its own zoom, pan, **Read** and **Overview** controls. Read mode opens a useful portion at readable scale; Overview fits the entire graph for orientation. Pick a component or class to navigate directly, hover an information icon for details, or walk through a sequence step by step. Focused views can reuse the same entities.
5. Enter editing mode to change prose, semantic fields, class members and column definitions. Drag diagram cards to arrange them; hover a node's circles to create connections, or an arrow's start/end circles to reconnect it. Sequence participant drags reorder lanes, and sequence connection gestures edit messages. Add nodes through the canvas toolbar or by double-clicking empty canvas; double-click labels or press F2 to rename them. The information icon opens the inspector for detailed fields. Escape cancels gestures; undo/redo operate on the shared model. Upload images as embedded data, with alt text and optional captions. The basic native prose editor provides bold, italic and code formatting; it is not a full word processor.
6. Use **Save HTML**, then reopen the downloaded copy. The file contains the current canonical model and reusable runtime, so the edited result remains interactive and editable. Browser changes do not automatically overwrite the file that was opened.
7. For another AI revision, give the agent that latest saved HTML. It extracts the current JSON, edits and validates it, then uses `update` to preserve the document's runtime and styles. A fresh `export` intentionally uses the installed runtime version.

JSON is useful as an optional source file and for version control. It is not a required companion for reading or editing a saved HTML document.

## Optional connected editing

`serve project.json` starts a server on `127.0.0.1`. Browser semantic edits persist to that JSON; external JSON edits are validated and sent back to the browser. This gives an agent and reader a live bidirectional editing loop while the CLI runs.

Writes include a base revision. A stale write receives a conflict instead of silently overwriting newer data. Review the competing changes and choose which version to continue from; this release does not merge concurrent prose or diagram changes automatically. Invalid external JSON retains the last valid model. Save HTML still produces a portable snapshot that opens independently of the server.

## Why modular source becomes one HTML file

The library separates model validation, document editing, diagram rendering, export and the optional server. That keeps implementation changes and checks manageable. The release build compiles the reusable browser runtime once; document export then inlines that runtime, CSS and escaped JSON into a single HTML file.

An agent supplies document data to the same library for every artifact. It does not generate a new application or run a frontend build for each document. Consumers can open the result offline without installing packages, resolving imports or fetching a CDN. Node.js is needed only when using the CLI or agent workflow.

There are costs to this delivery format:

- Every HTML carries its own runtime, so documents are larger than a thin webpage. Embedded images add their bytes plus base64 overhead.
- A browser's Save HTML action downloads a copy. Teams need a naming or version-control convention to identify the latest saved artifact.
- Runtime upgrades do not automatically change existing documents. Re-exporting with a newer installed runtime is an explicit choice.
- Semantic JSON is suitable for reviewing structural changes; HTML containing the compiled runtime is a noisy text diff.
- A local file provides no shared database, access control or simultaneous collaborative editing. Optional localhost sync coordinates revisions, not a multi-user hosted workspace.

## Rendering and dependencies

The custom semantic SVG renderer draws system, class, sequence and state views from the shared model. It owns selection, member rows, relationship notation, explicit message order, state shapes and view interaction. ELK supplies automatic graph layout; the renderer uses its coordinates rather than implementing a graph layout engine.

Member-bound class and database relationships attach horizontally to their exact rows. Their routes avoid card interiors and update when cards move; cardinalities stay beside the corresponding endpoints. Opposite transitions between aligned states use distinct ports and lanes so both arrowheads remain visible.

Marked parses Markdown prose, and DOMPurify sanitizes rendered content. The runtime uses those packaged libraries directly. Images are embedded PNG, JPEG, WebP or GIF data URLs. User data remains data: export escapes script-closing text and edits retain validated references. Third-party versions and exact license texts are in [the notices](../THIRD-PARTY-NOTICES.md).

## Document interface

The generated page prioritizes the subject matter. Search sits at the top left alongside icon-only theme, edit, save and About actions with accessible names and hover labels. Search supports arrow-key result selection and Enter activation. A narrow outline shows the title, subtitle and nested sections; it stays visible on desktop until hidden, and opens as an overlay on narrow screens. Dirty/sync conflicts remain visible when action is needed. About contains file/runtime details, data export/import and dependency notices. Canvas editing controls appear only in edit mode and are excluded from SVG exports.

## Version 0.4 boundaries and next extensions

Supported diagram types are system overview, class, explicit sequence and state. Class views support common relationship notation and explanatory columns. Sequence phase captions organize a trace; they do not implement formal UML combined fragments, guards, activation bars or complete UML semantics. State diagrams draw rounded states, choice diamonds, initial/final symbols and directed transitions, including cycles and self-loops. Semantic tones distinguish errors, warnings and recovery in both themes. Conditions/actions remain descriptive text; there is no executable state-machine simulation, nested/concurrent state semantics or history pseudostates. Timing diagrams are not included.

The monorepo onboarding wrapper reuses these diagram types and the base skill's format. Module/library entities distinguish repository boundaries from deployed services. Its bounded scanners gather evidence for the main agent to reconcile; host-specific delegation and model selection remain dependent on the installed host.

Dense graphs need zoom and focused views; fitting every entity does not make every label legible. Prose editing supports a basic rich-text subset, and arbitrary third-party editor extensions are not preserved as executable behavior. Images increase the artifact size and are not editable vector diagrams. Host manifests follow documented Codex, Claude Code and Copilot formats; end-to-end installation in every host is not claimed.

Reasonable extensions include structured sequence fragments with validation, additional diagram types, richer prose authoring, more accessible diagram navigation and better structural diff/merge tools. Each should extend the shared format and rendering checks so saved documents continue to round-trip, rather than requiring a separate application per artifact.
