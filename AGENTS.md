# FinalDiagrams project guidance

## Project context

FinalDiagrams produces complete technical documents as one editable, offline HTML file. Preserve the shared semantic model, arbitrary document block order, offline operation, safe data handling, and HTML round trips. Read [README.md](README.md), [CONTRACT.md](CONTRACT.md), and [docs/design.md](docs/design.md) for the existing contract and limits. The current package is version 0.4.1 and requires Node.js 20+ for development and CLI use; exported HTML needs only a browser.

The seven editor requirements, implementation outcomes, and verification evidence are recorded in [docs/editor-improvements.md](docs/editor-improvements.md). All seven were implemented on 2026-10-23. Keep that record current when changing these interactions.

For the ongoing editor-review handoff, the user converses in the coordinating parent chat. Return executor/reviewer findings and questions through the handoff for that chat to relay; do not ask the user to switch chats to answer.

## Source and generated output

- `src/app.js`: document UI, canonical edits, inspector, undo/redo, HTML save, and connected synchronization.
- `src/diagrams.js`: SVG rendering, layout/routing, diagram cameras, selection, and editing gestures. ELK supplies automatic layout.
- `src/styles.css`: document and diagram presentation.
- `src/model.mjs`: shared schema validation; `src/export.mjs`: HTML export/extraction; `src/server.mjs`: optional localhost synchronization; `bin/finaldiagrams.mjs`: CLI.
- `examples/`: semantic JSON sources and focused regression fixtures. Supported diagram types are `system`, `class`, `sequence`, and `state`; tables use row-based entities in existing views, not a separate diagram type.
- `scripts/build.mjs` bundles `src/app.js` into `dist/runtime.js`. After runtime changes run `npm run build`, then `npm run demo` to regenerate the showcase from `examples/all-diagrams.json` as `artifacts/all-diagrams.html` (title: “Architecture, data and behavior”). A demo export alone does not rebuild JavaScript.
- Fix reusable source rather than patching the compiled runtime or generated HTML. Change example JSON when changing example content. Existing exported files embed their own runtime and styles: re-export to receive runtime upgrades. CLI `update` replaces embedded data while preserving the old runtime/styles.
- Use the latest saved HTML as the input when preserving browser edits; extract its JSON before re-exporting. Do not replace user edits with an older example source.
- `npm run package` creates the four release ZIPs under `artifacts/`; rebuild/package releases when required by the task. Do not create another application or bundle per document.

## Persistence and shared data

File-mode edits live in the browser until **Save HTML** downloads a complete editable copy; it does not overwrite the opened file automatically. Reopen the saved copy to verify persistence. Optional `serve project.json` uses a server bound to `127.0.0.1`, revision-checked JSON writes, and event synchronization. Keep portable file mode independent of that server and free of network requests. Entities and relations are shared across views; consider effects on other views before implementing deletion or reconnection.

Accepted and implemented deletion behavior: normal Delete/multi-delete removes selected nodes, relationships and sequence messages only from the current diagram/view, preserving underlying shared entities/relationships and other diagrams. The separate explicit **Delete everywhere** action removes shared entities/relationships and dependent connections document-wide. Preserve this distinction.

## Mandatory implementation verification — user requirement

Whenever making an implementation change, **always use Chrome DevTools MCP to open the actual resulting page, exercise the changed behavior through real interactions, and visually inspect the rendered result**. Verify that it both works correctly and looks correct. Take and inspect screenshots where appropriate. Source inspection, automated tests, geometry checks, or DOM/accessibility snapshots alone do **not** satisfy the visual requirement.

Rebuild and regenerate the relevant output before reviewing it. Use the current page and current tool-discovered page/element references; do not persist transient browser IDs. Chrome DevTools MCP has successfully opened the local showcase after Codex was restarted to load the integration. Discover the current tools and connection each session rather than assuming that earlier browser state survives.

Choose representative cases relevant to the change, including a page scrolled down, a dense diagram, row-based table/class nodes, edit mode, and unaffected page/outline/search navigation. For routing changes inspect readable local detail and Overview, including paths, labels, endpoints, and arrowheads. For persistence changes save and reopen the actual result; for shared-model changes inspect affected sibling views. Verify cancellation and undo/redo when gestures or canonical edits change.

If Chrome DevTools MCP or the browser connection is unavailable, report browser verification as **blocked/incomplete**, never passed. Explain what remains unverified. Do not substitute a test run or snapshot for the missing visual check.

Run automated checks appropriate to the affected behavior as complementary evidence. Available scripts include `npm test`, `test:browser`, `test:canvas`, `test:editor`, `test:performance`, `test:database`, `test:state`, `test:connected`, and `test:release`; see `package.json` and README for prerequisites. Automated fixture outputs, downloads, and screenshots belong under `.cache/`; release tests exercise extracted bundles without `node_modules`. Do not claim agent-host installation compatibility unless actually exercised in that host.

For documentation-only work, check accuracy, links, and diffs; do not claim implementation behavior has been fixed or browser-tested merely because documentation was updated. Preserve unrelated user changes.
