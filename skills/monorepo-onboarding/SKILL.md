---
name: monorepo-onboarding
description: Create an evidence-based monorepo onboarding document with a high-level module map and database tables grouped by owning project, including database-to-code mappings. Use for repository-wide architecture and data-model orientation with bounded parallel scanning; compose the HTML through the companion finaldiagrams skill.
---

# Monorepo onboarding

Create a concise architecture and database guide for a developer new to the repository. Default to a high-level module overview and grouped database views, without code snippets or detailed business-logic walkthroughs. Honor the user's requested scope, audience, depth, model choices, and output location.

## Load the shared document skill

Read and follow [finaldiagrams](../finaldiagrams/SKILL.md) and its [project format](../finaldiagrams/references/project-format.md). Both skill folders are siblings in the plugin and the two-skill release. If installed elsewhere, resolve the installed `finaldiagrams` skill through the host's skill inventory. If the companion skill or its runtime is missing, report the incomplete installation; do not invent a renderer or download dependencies to replace it.

Use the companion skill's CLI for validation/export. Keep its schema and runtime as the single source of truth. This skill owns repository research, reconciliation, and presentation choices; it does not define a second document format.

## Inventory before delegation

Identify the repository root and revision, and note relevant uncommitted changes. Discover actual project/module boundaries from workspace/build manifests and project references. Classify applications/services, internal libraries, tooling, and unresolved categories. A folder alone is not proof of a module.

Create an inventory with stable module IDs, relative paths, category, and scan status. Include all first-party modules in the requested scope, even those with no persistence. Exclude installed dependencies, build output, and previous generated documents from scanning; inspect generated schema/model files when they are the repository's authoritative definitions.

Unless the user chooses a destination, use `finaldiagrams-output/monorepo-onboarding/` under the repository, containing `architecture-and-data.html`, `architecture-and-data.json`, and a `scan/` directory for inventory, findings, and coverage. Keep generated output outside an installed plugin and outside the source paths being inventoried. Reuse previous findings only after checking their revision and relevant file changes.

## Delegate bounded scans

Read [delegation](references/delegation.md) when using workers; it defines default models, host-specific dispatch, and overrides. Default to at most **three concurrent workers total**, within host limits. Batch small related modules. For a small repository, one worker or sequential inspection can be sufficient.

Use module scanners for responsibilities and dependencies, and database scanners for schema/mapping evidence. Assign a physical database/migration stream as one coherent scope when modules share it; do not let each worker reconstruct only part of the same migration history. Give each worker the relevant inventory slice, exact paths, neighboring module IDs, the [findings contract](references/findings.md), and the corresponding [scan brief](references/scanner-briefs.md). Specify depth and exclusions explicitly. Workers inspect source and return findings; the orchestrator writes intermediate files and owns the final document.

Do not give every worker the whole conversation or the full rendering instructions. Do not spawn one agent per file or let workers recursively fan out. If native delegation or suitable models are unavailable, perform the same bounded scans sequentially and state the execution mode accurately.

## Reconcile evidence

Use [findings](references/findings.md) to normalize IDs, deduplicate external dependencies and physical tables, and reconcile conflicting ownership or code mappings. Read the underlying files for material conflicts; leave unresolved facts explicitly uncertain.

Keep project/build dependencies distinct from HTTP calls, events, and database access. An import does not establish a network call or runtime order. Include architecturally significant external systems/packages without expanding every transitive utility dependency into a node.

Reconstruct the current repository-defined schema from snapshots, migration order, and ORM mappings. Historical columns are not automatically current. Match physical database identifiers to code names explicitly; account for shared tables, join tables, inheritance, converters, and unmapped columns. Centralized migration files do not establish domain ownership. Use Shared or Ownership unclear groups when ownership is not established.

Track every inventory entry as scanned, partial, excluded with a reason, or inaccessible. Record whether persistence was found, not found after inspection, or remains unknown. A missing worker result is a coverage gap, not a module with no database. Mark inferred purposes separately from verified names and constraints.

## Compose and verify

Read [document mapping](references/document-mapping.md) to turn reconciled findings into the shared FinalDiagrams model. Include the complete module catalog, a high-level system view, database relationships, focused module data views, and a brief coverage/uncertainty summary. Keep explanations short on the canvas; use details for evidence, mapping caveats, and constraints. Reuse canonical entities across views.

Use readable views instead of hiding modules/tables to reduce density. Default table purposes to one short sentence and column purposes to a few words. Do not invent source code or add deep implementation sections merely because files were inspected.

Validate with the companion CLI, then open the HTML when browser tools are available. Check group labels, physical names versus code mappings, cross-module relationships, search and a representative edit/save/reopen. State any untested part. Record the actual delegation mode and any model information the host reports; do not claim a requested model ran without evidence.

Return the HTML and JSON links with coverage limitations and the Save HTML instruction. When revising an existing guide, extract the latest saved model first and preserve its IDs and user edits where compatible with refreshed evidence. New `module`/`library` kinds require a 0.2+ runtime: use `export` with the packaged runtime when upgrading an older HTML, since `update` deliberately retains the old renderer.
