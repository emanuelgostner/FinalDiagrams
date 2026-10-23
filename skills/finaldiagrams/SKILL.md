---
name: finaldiagrams
description: Create or edit complete technical documents with interactive system, class, sequence and state diagrams, delivered as one editable offline HTML file. Use for architecture guides, design notes, onboarding documents, state transitions and illustrated technical explanations; reuse the packaged FinalDiagrams runtime.
---

# FinalDiagrams

Deliver the user's whole requested document as one self-contained editable HTML file. Preserve the requested prose, section order, code, images, caveats and diagrams; onboarding is only an example. Use the packaged runtime rather than generating diagram JavaScript, a replacement renderer or a separate website project.

Read [the project format](references/project-format.md) before authoring or changing JSON. Node.js 20+ runs the included CLI; opening the finished HTML needs only a modern browser. This workflow needs no API key, network service or consumer build.

## Compose the document

Use ordered `blocks` to express the complete document. Choose the number and arrangement of sections from the user's request. Mix headings, prose, diagrams, callouts, code and images where each helps the reader. Start prose as Markdown; preserve existing rich-text `content` when editing it. The native basic prose editor provides bold, italic and code formatting, not a full word processor or Tiptap extension system.

Keep the document focused on its subject. The runtime supplies the title, search and editing controls: do not repeat the document title as an opening heading or add product branding, generic guide slogans, entity counts or instructions about offline operation. Include a subtitle, diagram description or callout only when it adds context, a constraint or a useful explanation. Put save instructions in the handover, not in the document's prose.

Embed images as `image` blocks containing PNG, JPEG, WebP or GIF data URLs; the browser's image upload does this automatically. Add useful `alt` text and optional captions. External image URLs would break the offline artifact contract. Preserve user-supplied images without replacing semantic diagrams with screenshots.

Model each concept once in `entities`; diagrams select those shared IDs. Include explanatory `summary`, `description` and member `purpose` values so inspection answers useful questions. Add real `source` references only when verified against supplied material or inspected code. Label invented systems and illustrative pseudocode clearly; never manufacture repository evidence.

Choose a diagram by its semantics:

- `system`: responsibilities, boundaries and selected dependencies; group related nodes and label meaningful edges.
- `class`: types, fields, methods and relationships. Use purpose or custom columns when they explain intent. UML relationship kinds carry meaning, so do not select them just for visual variety.
- `sequence`: a specific ordered interaction. Write `messages` explicitly, including returns or async handoffs where relevant. Static relations are not a trace. `phase` captions organize the explanation; they do not implement formal UML `alt`, `par`, `loop` or activation semantics.
- `state`: lifecycle or UI behavior. Use `state`, `choice`, `initial` and `final` entities with directed `transition` relations. Write the trigger and condition in each transition label; document actions in labels/details where needed. Reuse the same state ID for returns and cycles. Apply semantic `tone` values to highlight error states or successful recovery, retaining meaningful text. Initial/final markers are optional for partial workflows.

Version 0.4 supports these four diagram types and direct canvas editing: users can add nodes, drag connection handles, reconnect endpoints and rename labels without changing the source format. State diagrams support branches, cycles and self-transitions; nested/concurrent states, history and executable state-machine behavior are outside this release. Describe unsupported formal UML constructs in prose or separate supported views, and disclose that representation. For dense systems, provide focused views of the same shared entities; an overview at fit scale is for orientation. Avoid unnecessary positions on new diagrams so automatic layout can operate.

## Generate or revise

Use the resolver script below, replacing `<skill>` with this installed skill's directory. It selects the standalone packaged assets when present, then the complete plugin's runtime. Write generated source and HTML in the user's requested workspace, outside the installed plugin.

```text
node <skill>/scripts/finaldiagrams.mjs validate document.json
node <skill>/scripts/finaldiagrams.mjs export document.json -o document.html
```

For an existing editable HTML artifact, extract its current model before editing; otherwise saved browser changes can be lost. Preserve unknown properties and stable IDs.

```text
node <skill>/scripts/finaldiagrams.mjs extract document.html -o document.json
node <skill>/scripts/finaldiagrams.mjs validate document.json
node <skill>/scripts/finaldiagrams.mjs update document.html document.json -o revised.html
```

`update` keeps that document's embedded runtime and CSS. Use `export` when intentionally moving the document to the installed runtime version; state diagrams and the compact document UI require runtime 0.3+. Do not rebuild runtime for an individual document. If packaged runtime files are missing, report the incomplete installation instead of silently replacing the library with custom code.

## Verify and hand over

Validate references, then open the HTML when browser tools are available. Check the complete prose, readable diagram layout, inspection details and a representative prose/member edit followed by Save HTML and reopen. A portable `file://` document must not require network access. Report any untested part honestly.

Return the HTML link and briefly explain that browser edits need **Save HTML** to download a new copy. Keep JSON as an optional editable source, not a required companion for viewing. For requested live editing alongside an agent, run `serve document.json --port 8787` with the same resolver; it binds localhost, persists JSON and checks revisions. Live sync is optional and only active while that CLI server runs. Do not start or publish external hosting for an offline document.
