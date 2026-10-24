# Editor improvements from voice review

Recorded and implemented 2026-10-23. All seven requested improvements are implemented in the maintained source and regenerated showcase. This document retains the original requirements and baseline findings alongside the resulting behavior and verification evidence. Standing implementation verification is mandatory in [AGENTS.md](../AGENTS.md).

Review target: `artifacts/all-diagrams.html`, titled **Architecture, data and behavior**, generated from `examples/all-diagrams.json`. The rebuilt page was opened and exercised in visible Chrome through Chrome DevTools MCP, with screenshots inspected. Paragraphs labeled **Baseline source evidence** describe the pre-change implementation; they are historical findings, not current limitations.

## 1. Stable entry into edit mode

**Implemented:** Preserve page scroll across document rebuilds, reserve the rendered canvas dimensions, and float editing tools above the relevant block. Property inspection does not resize the diagram: Edit mode now uses anchored cards (see the contextual-editing follow-up), while reading retains the right-side details panel. Entering and leaving Edit at a scrolled position preserved every document block's dimensions and page position in the regression check.

**User requirement:** Preserve the page viewport position and editable-area dimensions when entering edit mode, including after scrolling down.

**Reported symptom:** Clicking Edit jumps the page.

**Baseline source evidence:** `src/app.js` toggles `editing` and calls `renderApp()`, which replaces the application DOM and inserts edit-only bars and tools. It preserves diagram camera state, but does not explicitly preserve the page scroll position. `src/styles.css` controls edit/document layout. These are investigation starting points, not proof of every contributing cause.

**Suggested interaction, not mandatory implementation:** Float editing tools above the selected editable box without changing layout. An alternative is acceptable if viewport position and box dimensions stay stable.

**Acceptance:** Compare the same content's on-screen position and dimensions before/after entering and leaving edit mode while scrolled down; retain diagram camera and normal navigation.

## 2. Direct selection opens the properties panel

**Implemented:** Entity/card and relation selection open the inspector directly, including when it was previously closed. Table headers and relation arrows were exercised independently in Chrome.

**User requirement:** Selecting either a connection arrow or a container node must directly open the right-hand panel with the correct controls. Selecting a member first must not be necessary. “Container” here includes the table/entity card itself; do not assume this report requests editable visual group boundaries.

**Reported symptom:** In Database and code mappings, selecting `sales.order_headers` initially does not open the panel. Selecting a row opens it, after which selecting the container correctly updates it.

**Baseline source evidence:** In `src/app.js`, the renderer's `onSelect` callback returns early in edit mode when the inspector is hidden and the selected kind is not `member`. `onInspect` opens it unconditionally. This directly explains the reported selection asymmetry in the code.

**Acceptance:** Starting with the panel closed, select a table header/container and an arrow independently; inspect correct entity/relation controls. Repeat after row selection, closing the inspector, and switching views.

## 3. Create and reconnect links at individual rows

**Implemented:** Row handles and drop hit testing carry `sourceMember`/`targetMember` through creation and reconnection. Highlighted row feedback distinguishes a row target from a whole-card target. Reconnecting onto another row of the same entity works; dropping on the header restores whole-card attachment. Native Chrome drags verified the product link and same-table row change.

**User requirement:** Drag arrow endpoints onto individual rows in tables, classes, and other row-based nodes. Support both creating row-to-row links and reconnecting existing links.

**Reported example:** The product-ID relationship between `catalog.products` and `sales.order_items` renders at rows, but manual endpoint dragging targets only whole boxes.

**Baseline source evidence:** The model and renderer already support `sourceMember` and `targetMember`, validate member references, and route member-bound links. Canvas connection callbacks currently pass entity IDs only. Reconnection ignores a drop onto the existing entity and clears that endpoint's member binding when changing entity. The gesture flow therefore needs member identity, including same-entity/different-row changes; this is not a request for a new storage format from scratch.

**Acceptance:** Create and reconnect both ends at precise rows, including another row in the same table; show the target clearly. Verify stored member IDs, valid references, row attachment after moving cards, undo/redo, cancellation, and saved/reopened HTML. Preserve whole-box connections where appropriate.

## 4. Readable dense-diagram routing

**Implemented:** General card relationships now use obstacle-aware orthogonal routing, separated card endpoints, and collision-aware label placement. The 40-entity, 44-relation commerce example passed unrelated-card, path/label, and label/label intersection checks. Chrome screenshots were inspected in Overview and the Checkout API/Pricing/Order store region at readable detail. This does not promise crossing-free layouts for arbitrary graphs.

**User requirement:** Keep paths, endpoints, and arrowheads visible; avoid unrelated cards and label collisions. Make destinations understandable in Explore a dense system.

**Reported symptoms:** Overlapping paths, paths behind unrelated cards, labels crossing paths, and unclear destinations. The supplied screenshot showed Checkout API, Order outbox, Pricing service, and Order store. Its original temporary path was `C:\Users\emanuel\AppData\Local\Temp\codex-clipboard-90bdf709-dad4-4d25-9765-ef1d94e8c596.png`; it is contextual evidence, not instructions or a durable prerequisite. No evidence copy is required to reproduce with the maintained dense example.

**Baseline source evidence:** `src/diagrams.js` combines ELK routes, custom routes, and member-aware obstacle routing. Existing database obstacle/cardinality checks do not establish dense general-system readability. The showcase has a 40-entity, 44-relation commerce landscape.

**Acceptance:** Inspect the named region and the full dense fixture at readable zoom and Overview, including after moving cards. Inspect path/card intersections, shared segments, label collisions, endpoint separation, and visible arrowheads in screenshots. Do not reduce acceptance to geometry assertions or claim all graph crossings can be eliminated.

## 5. Familiar canvas editing gestures

**Implemented:** Blank-canvas left drag selects nodes; Shift adds or toggles selection. Selected graph nodes move together with relative offsets preserved. Sequence groups reorder participant lanes while retaining message order and endpoints. Delete removes nodes from the current view; **Delete everywhere** is a distinct confirmed action. Middle drag pans, including when started over a node. Right-click offers the existing semantic kinds with their built-in icons, plus state/choice/initial/final symbols in state views. Menu-created graph nodes use the clicked canvas location.

**User requirement:** In edit mode, left-drag blank canvas for marquee node selection; move selected nodes together and delete selected nodes together. Middle-mouse drag pans. Right-click inside the diagram opens a compact custom creation menu, with actions such as nodes, symbols, and icons. Distinguish node dragging from panning.

**Baseline source evidence:** Blank-canvas left-drag currently pans; middle-button input is ignored by that handler. Editing supports individual card movement, sequence participant-lane reordering, node creation, and connection handles; there is no marquee/multi-node gesture or custom context-menu handler. Entities and relations are shared across views; positions belong to individual diagrams. Sequence diagrams encode ordered messages and lane order, so group handling must preserve those semantics rather than treating them as a free-position graph.

**Proposed implementation choices:** Retain graph positions and relative offsets during group moves, commit a gesture atomically for undo, and preserve Escape/pointer-cancel behavior. Choose detailed selection modifiers, menu layout, and keyboard affordances during implementation; these are not additional user mandates.

**Accepted user decision — deletion scope (2026-10-23):** Normal Delete/multi-delete removes selected nodes only from the current diagram/view, preserving the underlying shared entities and other diagrams. The separate explicit **Delete everywhere** action removes entities document-wide with dependent references handled consistently. The user accepted this distinction with “Oh yeah, for sure. Let's go with that.” Both paths are implemented and regression-checked against shared views.

**Palette scope:** The menu creates the currently supported semantic kinds with existing icons and state symbols. There is no new arbitrary image/icon asset browser or freeform shape library. Sequence creation adds participants to the ordered lanes rather than assigning free graph coordinates.

**Acceptance:** Marquee, multi-move, and multi-delete; middle-button pan without node movement; menu creation at the intended canvas position; dismiss/cancel; undo/redo; and saved round trip. Verify that normal deletion preserves shared entities and other views, while the distinct Delete everywhere action removes entities document-wide without invalid references. Exercise graph and sequence behavior where supported and state any limits explicitly.

## 6. Uninterrupted page wheel scrolling

**Implemented:** Wheel events scroll the page by default. The visible **Enable wheel zoom** control deliberately activates zoom and changes to **Wheel zoom on · Esc to exit**. Escape or a click outside the canvas disables it. Regression checks verified page movement without camera changes, then activated zoom without page movement.

**User requirement:** Moving the pointer across a diagram must not hijack page scrolling. Default wheel behavior scrolls the document; diagram wheel controls require deliberate activation.

**Baseline source evidence:** `src/diagrams.js` currently calls `preventDefault()` and zooms on every canvas wheel event, with a non-passive listener.

**Proposed interaction, not a fixed requirement:** Click to activate diagram wheel controls, show an activation indicator, and deactivate on outside click or Escape. Another deliberate activation mechanism is acceptable if normal page navigation remains uninterrupted. No user decision is needed to investigate or choose a reasonable mechanism within this requirement.

**Acceptance:** Scroll down the document with the pointer repeatedly crossing multiple diagrams; verify page scroll and unchanged diagram cameras. Verify intentional activation, visible state, and deactivation, including edit mode and ordinary controls.

## 7. A discoverable Add diagram control and truly blank diagrams

**Implemented:** The persistent **+ Diagram** control offers blank system, class, sequence, and state diagrams. Each starts with empty entity and relation arrays (and empty messages for sequence), enters Edit, and navigates to the new diagram. All four families accepted their first node in the regression run; Chrome also verified blank creation and first-node entry directly. Saved HTML was extracted and reopened with an identical model.

**User requirement:** Add a plus/Add diagram control on the HTML page so the user can create new blank diagrams and build from scratch.

**Baseline source evidence resolving scope/storage questions:** There is already an edit-mode flow: **+ Add content → + diagram → New system/class/sequence/state diagram**. `addDiagram()` in `src/app.js` appends a diagram and a document block, but non-state diagrams reuse up to two existing entities; state diagrams seed initial/state/final nodes and transitions. Existing creation is therefore neither directly discoverable nor truly blank. The four supported families can reuse the existing validated model and persistence; database tables belong to existing views rather than a fifth diagram family.

**Proposed default:** Offer the four existing diagram families and start with no entities, relations, or messages. Make the existing creation path more direct, preserving deliberate type selection. Additional families are outside this request unless the user expands scope. Exact button placement and title editing can be resolved during implementation.

**Persistence already established:** Offline Save HTML downloads the current canonical model with the embedded runtime; unsaved browser edits do not overwrite the source file. Optional CLI `serve` persists revision-checked JSON. New diagrams should use this existing model. No cloud/collaboration/storage decision is required.

**Acceptance:** Create a truly empty diagram of each supported family, add content from scratch, edit its title, navigate to it, undo/redo, save and reopen. Verify empty-diagram rendering and node creation before declaring creation complete.

## Implementation and review discipline

Work in reusable source, build the runtime, and regenerate the actual review artifact before Chrome verification. Maintain schema validity and shared references. Add focused automated checks when appropriate, then carry out the mandatory real Chrome interactions and visual inspection described in [AGENTS.md](../AGENTS.md). Record actual outcomes and any blocked checks; this backlog alone is not implementation or acceptance evidence.

## Verification record — 2026-10-23

- Built with `npm run build` and regenerated `artifacts/all-diagrams.html` with `npm run demo`.
- Passed `npm test` (13 tests), `test:browser`, `test:canvas`, `test:editor`, `test:database`, `test:state`, and `test:connected` (6 tests). The editor suite covers scroll geometry, dense intersections, direct selection, row creation/reconnection, marquee/group movement, both deletion scopes, middle pan, context creation, deliberate wheel activation, four blank families, and saved/reopened HTML.
- Chrome DevTools MCP real interactions covered scrolled Edit entry, table-header and arrow selection, row-to-row connection creation, reconnecting to another row of the same table, marquee selection, Delete/Undo with a shared sibling view, and blank diagram/first-node creation. Screenshots of these cases and the dense Overview/local detail were visually inspected. Real Playwright pointer/keyboard interactions additionally cover middle-button pan and wheel scrolling.
- Test outputs and screenshots live under `.cache/test-editor`, `.cache/test-canvas`, and the existing suite-specific cache folders. Runtime, generated HTML, and maintained source were updated; release ZIPs were not rebuilt or release-host installation tested for this task.

## Follow-up: edit latency — 2026-10-23

The user reported an approximately two-second pause after adding nodes, methods, or arrows. A separate Chrome reproduction measured 1,591 ms for adding a method, including a 1,160 ms main-thread task; profiling identified repeated obstacle routing for unrelated diagrams. The app now retains unchanged canvases during document rebuilds and skips unchanged semantic refreshes. Only the edited view receives gesture-position writes. The route search uses lazy obstacle checks and an admissible Manhattan A* heuristic.

The identical method benchmark fell to 248 ms with no recorded long task. A focused regression run measured 189 ms for a shared method addition, 53 ms for a node, 57 ms for a connection, and 244 ms for a node in the 40-entity dense view. These are local observations, not universal timing guarantees. `test:performance` also verifies that unchanged diagram DOM survives, shared views update together, retained canvases still open their node editor, Undo/Redo works, and saved HTML reopens with the same model. The existing editor, database, canvas, browser, state, and connected suites passed after the change. Chrome DevTools MCP native interactions and screenshots complement these automated checks.

## Follow-up: canvas bounds, grouping, selection deletion and block movement — 2026-10-23

Removed the positive-coordinate clamp from node dragging. Single and multiple graph nodes now follow the pointer across the origin, and rendered bounds include their negative coordinates for Overview and SVG export. Group creation is available from the node context menu and inspector. Users can join existing groups, rename a diagram's group label, edit shared membership, and remove a group while retaining its contents. Group headers open their inspector directly. A new pointer press clears only the prior gesture's trailing-click suppression, keeping these controls responsive.

Delete/Backspace now handles relationships and sequence messages as well as nodes. Shift-click combines selections; marquee includes fully enclosed connection paths. One undo restores a mixed deletion. Normal deletion preserves shared entities/relationships and sibling views, including when the view originally implied all relationships by omitting `relationIds`. Text fields keep normal Delete behavior. The explicit context-menu Delete everywhere action remains distinct.

Document block controls remain visible in Edit mode. Each block has a drag handle for reordering, with an insertion line and unchanged content dimensions. Diagram and prose blocks can move across one another; existing diagram canvases and camera state are retained. Escape or dropping outside the document cancels, move buttons remain available, and order changes save in the existing HTML format.

Passed `test:bounds`, `test:groups`, `test:deletion`, `test:blocks`, `test:editor`, `test:canvas`, `test:browser`, and `test:performance`. Focused suites cover cancellation, mixed selection, shared-view scope, negative-coordinate export, undo/redo and saved/reopened HTML. Chrome DevTools MCP native interactions moved a node past both origins, created an Ordering module group and changed its membership, dragged both diagram and text blocks, and deleted/restored a selected connection while preserving its sibling view. Rendered screenshots were inspected for the group bounds, persistent block controls, reordered blocks and remaining connection. Initial screenshot capture timed out; resizing the review viewport restored capture and the visual checks completed. The user's live model is captured separately under `.cache/canvas-bounds/` before exporting `artifacts/architecture-data-behavior-editor.html`; the showcase remains generated from example source.

## Follow-up: contextual property cards — 2026-10-23

Edit-mode selection and information controls now open a compact card anchored near the clicked item, preferably above it. This replaces the editing drawer for relationships, nodes, table/class members, groups, sequence steps and diagram settings. Reading retains the details panel. The card leaves the diagram dimensions and clicked source point unchanged; tall cards scroll within the available viewport space.

Text properties open a second card containing only their input or textarea. Outside click saves, Enter saves a single-line value, Ctrl/Cmd+Enter saves multiline text, and Escape cancels the draft. Secondary editors sit beside the main card when space permits, so another property stays reachable. Switching directly from text to another property saves the draft and opens that property with one click. Save HTML also flushes pending text. Notation choices show a right-aligned SVG preview using the same appearance definition as graph markers, including dashed lines, triangles and filled/open diamonds. Relationship labels now have information controls even when their text is empty.

Passed `test:context`, `test:browser`, `test:canvas`, `test:editor`, `test:groups`, `test:deletion`, `test:state`, `test:database`, and `test:performance` during this change. Focused coverage includes commit/cancel and property switching, shared views, row/member and sequence editing, unchanged canvas dimensions, undo/redo, mobile/dark layouts, and actual HTML download/reopen with zero network requests or browser errors. The final popup-placement adjustment was rechecked by `test:context` and `test:browser`.

Chrome DevTools MCP opened the rebuilt user document, selected a relationship's information control, edited its label, switched directly to the notation picker, and applied composition. Screenshots of the main card, separate text editor, and notation previews were inspected. Chrome also reopened the HTML downloaded by the focused test and inspected a table member's card on a scrolled page; mobile and dark screenshots were inspected separately. The refreshed `artifacts/architecture-data-behavior-context-editor.html` preserves the captured user model exactly (revision 80, 73 entities, eight diagrams, 22 blocks), with no QA edits included. Rebuilt runtime and showcase are current; release ZIPs were not regenerated.

## Follow-up: drag icon and table borders — 2026-10-23

Replaced the block handle's font glyph with a centered six-dot SVG, preserving its accessible name and drag target. Table/class cards now omit the last row's redundant bottom divider, clip row highlighting to the rounded card, and draw the outer outline above the header and row fills. Card dimensions, row connection anchors and editing gestures are unchanged.

Rebuilt the runtime and showcase. `test:blocks` and `test:database` passed, covering block movement/cancellation/undo, row connections, SVG export and saved HTML reopening. Chrome DevTools MCP opened the resulting document in a separate review tab, entered Edit mode, navigated to catalog.products, and hovered its last row. Screenshots confirmed the centered icon and clean rounded bottom border with the row highlight visible on a scrolled page. The user's open tab was left intact, and its newer revision 103 model was captured under `.cache/drag-icon/` before refreshing `artifacts/architecture-data-behavior-context-editor.html`.

## Follow-up: square canvases and initial Overview — 2026-10-24

Diagrams now initially use Overview rather than Read. Normal document canvases have a 1:1 aspect ratio excluding the header; expanded views use the available window space and fit Overview. The embedded renderer has no additional border or rounded corners, eliminating the nested bottom-corner outline. Camera resizing tracks height as well as width. Existing explicit Read, search focus and retained edit cameras remain available.

Rebuilt the runtime and showcase. Chrome DevTools MCP interactions and inspected screenshots covered the scrolled dense Overview, table Overview in Edit, expand/collapse, search navigation and a narrow viewport. All seven canvas frames measured square in desktop Edit and narrow read layouts. All 13 core tests passed outside the sandbox after sandbox-only localhost/file-rename failures. The browser regression now checks initial undimmed Overview and square dimensions before explicitly selecting Read.

The full test:browser suite passed outside the sandbox (the sandbox run canceled its download), including search, Read/Overview focus, HTML save/reopen, dark/mobile/dense layouts, and zero network requests or browser errors. Source diff whitespace checks passed; generated bundled dependency text retains its build-generated trailing whitespace.

## Follow-up: revised canvas height — 2026-10-24

At the user's request, replaced the square layout with a fixed 645 px canvas below the header, approximately 15% taller than the original 561 px. Overview remains the default and the corner fix remains intact. Expanded views still fill the window. Rebuilt the runtime and showcase; test:browser passed, including the updated height assertion and saved HTML reopening. Chrome DevTools MCP screenshot inspection in an isolated review tab verified the normal table canvas; all seven normal canvases measured 645 px high. Edit-mode and expanded table screenshots were also inspected.


## Follow-up: viewport-filling expansion and automatic wheel zoom — 2026-10-24

Expanded diagrams now fill the browser viewport without outer margins or rounded frame corners. The Edit toolbar stays inside the fullscreen card; document-level controls remain behind it, and background page scrolling is locked. Expansion enables wheel zoom, closing disables it, and using the diagram toolbar does not deactivate it. Escape and the wheel toggle retain their explicit opt-out behavior. Recreated expanded controllers also enable wheel zoom.

Rebuilt runtime and showcase. Chrome DevTools MCP clicks and inspected screenshots covered expanding and closing a scrolled table diagram, wheel-toggle state, dense Edit-mode fullscreen, and a narrow viewport. The fullscreen frame measured exactly 1200 by 900 at origin 0,0. The browser regression exercises actual wheel input, viewport geometry, toolbar interaction, close-state reset, and HTML save/reopen.

The final test:browser run passed, including fullscreen wheel/geometry assertions and zero network requests or browser errors. Source diff whitespace checks passed.

## Follow-up: edit toggle in diagram toolbar — 2026-10-24

Each diagram now includes an Edit/Done button beside Read and Overview. It uses the same document editing toggle as the app bar, preserving the expanded card and camera when entering or leaving editing. The button exposes its state with aria-pressed.

Rebuilt runtime and showcase. test:browser passed outside the sandbox after the sandbox run canceled its HTML download. Added regression interactions verify entering and leaving editing while expanded, camera preservation, editing controls, and continued wheel zoom. The suite also passed HTML save/reopen and existing navigation checks. Source diff whitespace checks passed.

Required Chrome DevTools MCP visual verification remains blocked/incomplete: both listing pages and opening the resulting showcase failed because the MCP browser profile was already in use. The new toolbar's rendered appearance and manual fullscreen interactions have not been visually verified through MCP. Release ZIPs were not regenerated.

## Follow-up: pinnable information cards — 2026-10-24

Replaced the read-only side drawer and duplicate tooltip with one anchored information card. Hover or keyboard focus previews it; clicking the information icon, node, Pin, or a card action pins it. Pointer travel into the card keeps it open. Full descriptions are no longer truncated, and source references remain clickable. The header offers compact Copy link (entities and parent entities for members) and Edit actions. Connections, fields, methods and group membership retain navigation in collapsible sections; sequence Previous/Next and member-to-parent navigation remain available. Escape, outside click and Close dismiss the card. Keyboard activation of an information icon moves focus into the card. Edit uses the existing contextual editor, with unchanged canonical saves and undo/redo.

Rebuilt the runtime and showcase. Passed test:info, test:browser and test:context; the focused suite was rerun after the final keyboard-focus change. Coverage includes hover dismissal, pin persistence, untruncated text, source/copy links, relationship/member/sequence navigation, edit cancel/commit/undo/redo, mobile fullscreen, HTML save/reopen and zero network requests or browser errors. Chrome DevTools MCP real hover/click interactions and inspected screenshots covered Inventory service preview/pinning, connection navigation, and a scrolled table in fullscreen with collapsible fields and transition into Edit. Source whitespace checks passed. Release ZIPs were not regenerated.


## Follow-up: diagram-scoped pencil toggle — 2026-10-24

Supersedes the shared Edit/Done behavior above: each diagram now has the same pencil/check icons as the app bar, with an accessible label and pressed state. Its toggle controls only that diagram's gestures, toolbar and property cards, leaving prose and sibling diagrams in read mode. The app-bar toggle applies to the whole document and clears local overrides. A diagram may also leave editing individually while document editing stays active. The read-mode details card's Edit action enables only its diagram. Shared entities/relationships continue to update in all views; editing scopes are temporary UI state.

Rebuilt runtime and showcase. Passed test:diagram-editing, test:browser, test:canvas and test:info outside the sandbox where necessary for HTML downloads. Focused regression coverage includes icon-only controls, fullscreen retention, untouched prose and sibling controllers, member editing, node/property cancellation, shared data propagation into a read-only sibling, undo/redo, local/global transitions, and HTML save/reopen without persisted editing state. Existing browser checks cover navigation, dense/mobile/dark layouts, while canvas and information-card suites cover gesture and inspector compatibility. Source diff whitespace checks passed.

Required Chrome DevTools MCP verification remains blocked/incomplete: listing pages and opening the rebuilt showcase (including an isolated-context attempt) returned the same profile-in-use error. The changed toolbar still needs real MCP interactions and screenshot inspection on the scrolled showcase, including table and dense diagrams. Automated checks do not replace that visual verification. Release ZIPs were not regenerated.

## Follow-up: internal relations stay inside group borders — 2026-10-24

Group frames previously enclosed only their nodes, so an internal relation routed beside a node could leave the group. Frames now include internal paths, labels and cardinalities with padding and heading space. Relations connecting different groups do not enlarge the frames. Permanent SVG geometry is read in a batch after rendering; hover/edit handles do not affect group size. Node coordinates, shared data and connection routes remain unchanged.

Rebuilt runtime and showcase. Added examples/group-contained-relations.json and test:group-routing for stacked libraries, row-bound table links, reciprocal state transitions and a self-loop. Passed test:group-routing, test:database, test:groups, test:performance and test:state, including movement/cancellation, undo/redo, external-link exclusion, SVG export and saved HTML reopening. The state suite initially timed out waiting for the former tooltip; its hover/focus checks now target the existing information card, and the rerun passed. Source diff whitespace checks passed. Release ZIPs were not regenerated.

Chrome DevTools MCP was available for this change. Compared the reproduced overflowing library relation with the corrected expanded view and inspected screenshots. Real controls exercised diagram-only editing, expansion, outline navigation, Read/Overview and search navigation. The drag helper detached during redraw after movement; Escape/Undo restored the original positions, and automated pointer tests separately verified complete dragging and cancellation. Final rebuilt-page screenshots covered a scrolled table diagram in Edit, fullscreen reciprocal/self state loops, the dense showcase in Overview and readable detail, and the actual downloaded HTML reopened in Chrome. Internal paths, labels, row endpoints, arrowheads and group-border clearance were visually inspected.
