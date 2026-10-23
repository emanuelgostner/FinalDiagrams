# Scanner briefs

The orchestrator supplies one of these briefs with a bounded assignment and the findings contract. Return findings to the parent; do not generate HTML, alter repository source, or spawn more agents.

## Module scanner

Inspect the assigned first-party projects using their manifests, public entrypoints, configuration, and enough integration code to identify responsibilities and dependencies. Read README material as contextual evidence and check it against code/configuration when it makes architectural claims.

Return a short purpose and category for each assigned module, its declared internal references, and significant verified runtime connections or external packages. Keep project/import relationships separate from HTTP calls, database access, event publication, and consumption. Do not infer a deployment boundary or call sequence from directory names or imports. Trace an unresolved reference just far enough to identify its target; report the remainder rather than scanning the whole repository.

Identify where persistence mappings and schema definitions live so the orchestrator can assign database work coherently. Include tooling/shared-library projects in coverage even if they have no runtime interactions. Avoid business-logic walkthroughs, source excerpts, and exhaustive transitive dependency inventories.

## Database scanner

Inspect the assigned logical database or persistence scope, including current schema snapshots, migration history and ORM mappings. Use migration ordering and explicit rename/drop operations to establish repository-current columns. Check snapshots and mappings for drift instead of assuming either is always authoritative. Do not run migrations or connect to a database for this read-only repository scan.

Record qualified physical table identities, mapped classes and properties, DB types and constraints when verified, and concise purposes. Account for explicit physical-name overrides, shadow/owned fields, inheritance, converters, split/shared tables, and join tables where encountered. Preserve unmapped objects and unknown physical names instead of manufacturing mappings.

Identify likely domain ownership from the module consuming/defining the mapping, supported by evidence. A central migration/tooling project is not automatically the owning domain. Record shared or unclear ownership and consumers. Preserve database-enforced FK column sets separately from ORM-only or inferred associations; derive multiplicities only from verified constraints.

Return evidence and uncertainty for discrepancies and purpose/ownership interpretations. Cover each assigned module, recording persistence as found, none-found after inspection, or unknown due to incomplete work. Stop when the assigned schema/mapping scope is accounted for; do not trace unrelated application internals.
