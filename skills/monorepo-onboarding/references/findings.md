# Scanner findings contract

This is an intermediate evidence format, not the FinalDiagrams document schema. Workers return one JSON object per bounded assignment. The orchestrator supplies canonical module IDs from the inventory, persists results, and produces the final document using the companion skill.

Use repository-relative paths with `/`, and verified line numbers when available. An evidence item is `{ "path": "relative/file", "line": 12, "note": "What this location establishes" }`; omit `line` rather than guessing it. Status values are `verified`, `inferred`, `unknown`, or `conflict`. Distinguish confidence in a purpose/ownership interpretation from evidence for a physical name.

## Envelope

```json
{
  "scanVersion": 1,
  "assignmentId": "inventory-assigned-id",
  "revision": "inspected revision or unavailable",
  "scope": { "moduleIds": [], "paths": [] },
  "inspectedPaths": [],
  "modules": [],
  "dependencies": [],
  "tables": [],
  "relationships": [],
  "coverage": [],
  "uncertainties": []
}
```

Populate the relevant arrays; module workers may leave tables empty and database workers may leave module responsibilities empty. Empty arrays do not imply that unassigned areas were checked. `coverage` records which work was actually completed.

## Records

| Collection | Fields |
| --- | --- |
| `modules` | `id` from inventory, `name`, `path`, `category` (application, service, library, tooling, unknown), `purpose`, `purposeStatus`, `evidence` |
| `dependencies` | `sourceModuleId`, `target` (`moduleId` when known, otherwise `externalName` or `unresolvedReference`), `connectionType` (project-reference, import, http, event-publish, event-consume, db-read, db-write, other), `label`, `status`, `evidence` |
| `tables` | `database` (logical connection identity, not credentials), `schema` (null if unestablished), `name` (physical name), `ownerModuleIds`, `ownershipStatus`, `codeClasses` (`moduleId`, qualified `name`, source `path`), `purpose`, `purposeStatus`, `columns`, `evidence` |
| table `columns` | `name` (physical), `databaseType` (null if unknown), `codeProperties` (qualified class/property names and source paths), `purpose`, `purposeStatus`, `primaryKey`, `nullable` (true, false, or null), `default` (text or null), `details`, `evidence` |
| `relationships` | physical `sourceTable` and `targetTable` identities (database/schema/name), `sourceColumns` and `targetColumns` arrays, `enforcement` (database, orm-only, inferred, unknown), optional supported multiplicities, `status`, `evidence` |
| `coverage` | `moduleId`, `aspect` (architecture or database), `status` (scanned, partial, excluded, inaccessible), `persistence` (found, none-found, unknown) for database scans, `reason` when incomplete/excluded |
| `uncertainties` | `subject`, `question`, `evidence`, optional `neededEvidence` |

Use null/empty values for genuinely missing optional facts and explain meaningful gaps. Do not label nullable, defaults, physical constraints, or ownership as verified based only on naming conventions. Include views and unmapped database objects when relevant, marking their object type in `details` or additional metadata. Unknown extra properties may carry useful evidence; do not erase them during reconciliation.

## Reconciliation rules

- Physical identity is `(logical database, schema, table)`, not class name or bare table name. Keep same-named tables in distinct databases separate. Use an explicit unknown schema rather than assuming `public` or `dbo`.
- Multiple classes/properties may map to one table/column, and one class may map across tables. Preserve arrays. If a raw-SQL or join table has no entity class, say so instead of inventing one.
- Resolve references against the inventory and evidence. Keep external dependencies separate from unresolved internal references.
- Reconcile a migration stream in order, including renames/drops; do not union historical DDL into the current model. State whether a snapshot, ORM mapping, migration reconstruction, or combination supplied the schema and record discrepancies.
- Ownership can be shared or unresolved. Migration execution ownership and domain/data ownership are distinct facts.
- A column named `customer_id` is not evidence of a foreign-key constraint. ORM navigation alone does not establish a database-enforced FK. Composite relationships retain their complete column sets.
- Completion requires coverage for every inventory entry and requested aspect, including modules with no persistence. Unreturned, partial, or inaccessible assignments stay visible as gaps. The final coverage report also records the repository revision/dirty state, delegation mode, observed models, and excluded paths.

Keep purpose phrases concise. Put evidence and nuance in details; the final document can show short inferred-purpose text with an inference note in its inspector.
