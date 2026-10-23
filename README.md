# FinalDiagrams

Whole technical documents with interactive software diagrams, delivered as **one editable offline HTML file**. Write an architecture guide, design note or onboarding document with prose, code, callouts, embedded images and diagrams in any order. Consumers open the HTML in a modern browser; no server, CDN, account or build is needed.

Version 0.4 includes system overviews, class views, explicit sequence diagrams and state diagrams, plus a repository onboarding workflow. Shared entities keep views consistent; modules and libraries can be distinguished from deployed services. State diagrams support decisions, initial/final markers, cycles, self-transitions and semantic colors. Diagrams support independent zoom, pan, layout, search and inspection; class members have purpose and custom columns. The basic prose editor supports bold, italic and code formatting, alongside semantic data editing, undo/redo and JSON import/export. Image uploads embed PNG, JPEG, WebP or GIF data directly in the document. Advanced UML constructs such as concurrent/composite states, combined sequence fragments and activation semantics are outside this release.

Documents open with their content first: a slim search field with its keyboard shortcut, icon actions with hover labels and one title. A narrow outline shows the document title, subtitle and nested sections beside the content. It starts visible on desktop, can be hidden, and remembers that choice per document; on small screens it opens as an overlay. Search results support Up/Down to select, Enter to open and Escape to close. File details, project data and import controls are available through the About icon. The viewer adds no product branding, generic guide slogans or repeated reading instructions.

## Use a release

Unzip `finaldiagrams-plugin.zip` and run the commands below from its top-level `finaldiagrams/` directory. Its runtime is already packaged. Node.js 20+ is needed for the CLI and agent skills; viewing or editing an exported HTML needs only the browser.

| Release | Includes |
| --- | --- |
| `finaldiagrams-plugin.zip` | Complete plugin: both skills, one shared runtime, and native Claude worker configurations |
| `finaldiagrams-skills.zip` | Standalone sibling `finaldiagrams/` and `monorepo-onboarding/` skills; one runtime in the base skill's assets |
| `finaldiagrams-copilot-skills.zip` | Copilot CLI standalone skills with `/finaldiagrams:monorepo-onboarding`; one shared runtime |
| `finaldiagrams-skill.zip` | Standalone base `finaldiagrams/` skill only |

```sh
node bin/finaldiagrams.mjs validate examples/backend-onboarding.json
node bin/finaldiagrams.mjs export examples/backend-onboarding.json -o onboarding.html
node bin/finaldiagrams.mjs extract onboarding.html -o edited.json
node bin/finaldiagrams.mjs update onboarding.html edited.json -o revised.html
```

Open `onboarding.html`, edit the document or select a diagram item to edit its data, then use **Save HTML** to download a new copy. Reopen that copy to continue. The original file is not overwritten automatically, and unsaved browser changes are not durable.

In **Edit document** mode, work directly on each diagram:

- Drag a card to move it. In a sequence diagram, drag participant headers to reorder their lanes.
- Hover a node to reveal circular handles; drag one onto another node to create a connection. The **Connect** button also lets you select a source and destination.
- Hover an arrow to reveal its start/end handles, then drag either handle onto another node to reconnect it. Sequence arrows edit message participants; state arrows edit transitions.
- Use **+ Node**, or double-click empty canvas, to add a named node or participant. Double-click a label (or focus it and press F2) to rename it.
- Press Escape to cancel a gesture. Undo/redo and Save HTML retain changes to the shared model. The **i** button opens detailed fields in the inspector.

The combined [all-diagrams example](examples/all-diagrams.json) covers every diagram type, grouped database tables and a dense system overview. Run `npm run demo` to produce the single `artifacts/all-diagrams.html` preview.

Database relationships attach to their key rows and route around table cards. The showcase uses **PK → FK** arrows with `1`, `1..n` and `0..n` endpoint annotations; its prose distinguishes database constraints from application rules. Opposing state transitions use separate lanes so their arrowheads remain distinguishable.

For optional live synchronization between JSON edits and the browser:

```sh
node bin/finaldiagrams.mjs serve examples/backend-onboarding.json --port 8787
```

Open the localhost URL printed by the CLI. Changes persist to the JSON source with revision checks; stale writes are rejected. The server binds `127.0.0.1` and runs until Ctrl+C. An exported HTML remains portable and uses no live connection when opened as a file.

## Agent integration

The base `finaldiagrams` skill creates arbitrary complete documents using the packaged runtime. The new `monorepo-onboarding` wrapper gathers source evidence about modules, libraries, database usage and key flows, then uses the base skill to produce a complete onboarding guide.

In Claude Code with the full plugin, invoke `/finaldiagrams:monorepo-onboarding`. In Copilot CLI, install `finaldiagrams-copilot-skills.zip` to use the same command. In Codex with portable standalone skills, invoke `$monorepo-onboarding`. The skill bundles keep both skill directories as siblings and do not auto-install native Claude workers. VS Code uses the full plugin for prefixed commands; its skill-name rules differ from Copilot CLI.

The full plugin configures Claude scanner workers with `claude-sonnet-5-5` and caps concurrent workers at three. The main model remains host-selected; Opus 5.5 is suggested for coordination. Users can override choices through available host controls. Other hosts use their available delegation tools or perform scans in the main agent; Claude-specific model settings are not guaranteed there. See [installation and host support](docs/agent-installation.md) for the scope of verification.

The source format is described in [the skill's project reference](skills/finaldiagrams/references/project-format.md). `export` uses the installed runtime; `update` changes the embedded model while retaining the existing HTML's runtime and styles.

See [workflow and design](docs/design.md) for the editing loop, engine choices, single-file tradeoffs and version 0.4 limits. Follow the steps below to upgrade an existing HTML to the installed runtime.

## Update Copilot skills and existing HTML

Each generated HTML embeds its own runtime and styles. Updating the installed skills applies to future exports; existing documents need to be re-exported to receive the new UI and diagram features.

1. Update both personal skills by extracting the latest Copilot CLI bundle in PowerShell:

   ```powershell
   Expand-Archive `
     -LiteralPath "C:\Projects\FinalDiagrams\artifacts\finaldiagrams-copilot-skills.zip" `
     -DestinationPath "$env:USERPROFILE\.copilot\skills" `
     -Force
   ```

   Adjust the ZIP path for a downloaded release. For a repository-only installation, use that repository's `.github/skills` directory instead. Run `/skills reload` in Copilot CLI, or restart it.

2. Save any browser edits using **Save HTML**, then regenerate from that saved copy. In the folder containing it, run:

   ```powershell
   $fdCli = "$env:USERPROFILE\.copilot\skills\finaldiagrams\scripts\finaldiagrams.mjs"

   node "$fdCli" extract ".\onboarding.html" -o ".\onboarding.upgrade.json"
   node "$fdCli" export ".\onboarding.upgrade.json" -o ".\onboarding.updated.html"
   ```

   Replace `onboarding.html` with your filename. If you installed the skills in a repository, point `$fdCli` to its `.github\skills\finaldiagrams\scripts\finaldiagrams.mjs`. Open `onboarding.updated.html`; the original remains untouched. The extracted JSON preserves the document's content, diagrams and saved edits.

Use **`export` for runtime upgrades**. The `update` command changes embedded document data while preserving the old JavaScript and styles. The release runtime is already built; these steps require Node.js 20+ but no library build or repository rescan.

Alternatively, after updating the skill, ask Copilot to perform the HTML upgrade:

```text
/finaldiagrams Upgrade ./onboarding.html to the installed runtime.
Extract its embedded data and re-export as ./onboarding.updated.html.
Preserve all content, diagrams and saved edits.
```

## Recipes

### Monorepo onboarding with Copilot CLI

Install `finaldiagrams-copilot-skills.zip` using the [installation instructions](docs/agent-installation.md#copilot-cli-prefixed-onboarding-command), open your target monorepo in Copilot CLI, and use this prompt:

```text
Use the /finaldiagrams:monorepo-onboarding skill to generate an onboarding document
for this repository: a high-level module overview with connections,
plus database diagrams grouped by module, including physical column
names, matching code classes/properties, and brief purpose explanations.
Produce one editable offline HTML file.
```

### UI validation state diagram

Use the base skill for a small behavior guide:

```text
Use the /finaldiagrams skill to explain this field-validation behavior
with a state diagram: Save or losing focus validates input. Invalid or
missing input shows an error. An existing error clears only when the
input is correct and the field loses focus; typing or Save alone does
not clear it. Show a decision branch, error states and green recovery
transitions. Keep the prose brief and deliver one editable offline HTML.
```

See [the example source](examples/input-validation-state.json), or open its state view in the combined showcase generated by `npm run demo`.

## Examples and library development

The single showcase combines a fictional Order platform overview, a 14-message sequence, a domain class diagram, validation states, a reciprocal retry loop, grouped database tables with code mappings and cardinalities, and a 40-node landscape. JSON sources and focused regression fixtures live in `examples/`.

From a source checkout, library development requires dependency installation and a runtime build:

```sh
npm install
npm run build
npm run demo
npm test
npm run test:browser
npm run test:state
npm run test:database
npm run test:canvas
npm run test:connected
npm run package
npm run test:release
```

`demo` writes only `artifacts/all-diagrams.html`; `artifacts/` also holds the four ZIP releases. Automated browser checks generate their fixture HTML, downloads and screenshots under `.cache/`. Browser checks can use an installed Chrome or Playwright's Chromium (`npx playwright-core install chromium`). Set `FINALDIAGRAMS_BROWSER` to a browser executable path when needed. `package` writes all four ZIP releases. Release tests require Python 3's standard ZIP reader and run the extracted CLI without `node_modules`; they do not exercise installation inside agent hosts. A new document never needs its own JavaScript bundle.

Bundled runtime dependencies and their license texts are listed in [third-party notices](THIRD-PARTY-NOTICES.md). This notice file does not select a license for FinalDiagrams itself.
