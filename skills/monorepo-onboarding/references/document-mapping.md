# Map findings into the document

Read the companion [project format](../../finaldiagrams/references/project-format.md) for the authoritative schema and CLI workflow. The mappings below specialize that format; they do not add a new renderer or change its schema version.

## Architecture and catalog

Include a short system introduction and a complete module catalog with name, path, category and one/two-sentence purpose. Record unavailable/partial modules and explicitly excluded areas in coverage. Use `system` diagrams for internal modules and meaningful external components, with focused views as needed.

Use `kind: "service"` for a verified application/service, `"library"` for an internal code library, and `"module"` for tooling or a generic project boundary. External packages/services use `"external"`; stores/queues can use `"database"`/`"queue"`. A module node does not by itself assert a separately deployed service. `module` and `library` are supported by runtime 0.2+.

Use stable IDs based on inventory identity, not display text. Project references/imports map to `dependency` relations. Verified runtime calls, messages and store access may use `calls`, `async`, `reads`, `writes`. Label their actual semantics and explain the legend. Keep uncertain connections visibly qualified in labels/details, or put them in uncertainties rather than presenting them as established runtime arrows.

## Database cards and groups

Represent each physical table once as `kind: "table"`, in `class` views. Use a canonical ID such as `table:<logical-db>:<schema-or-unknown>:<physical-name>`. Preserve the physical identity separately in extra JSON metadata if needed. One entity may appear in several views.

- `name`: physical `schema.table` plus mapped qualified class name(s), for example `billing.invoices ↔ Billing.Invoice`. Include the logical database when names would otherwise collide. If no mapping exists, display that fact. For many classes, show a concise count/header and list all mappings in `description`.
- `summary`: a short table-purpose sentence; qualify inference briefly when necessary.
- `description`: complete mapping list, ownership explanation, schema source/revision, discrepancies and evidence paths. Class declarations and SQL snippets are unnecessary.
- `source`: a verified representative mapping/schema path, with a line only if checked. Keep additional evidence in description/metadata; do not fabricate repository web URLs.
- `group`: a stable owning-module group ID. Shared or unresolved ownership receives its own explicit group, while description lists owners/consumers. One entity has one group; do not duplicate a table to simulate multiple owners.
- `fields`: one member per current physical column, with stable IDs such as `column:<physical-name>`.

For every database view, supply `groups: [{"id":"module-id","label":"Module/project name","description":"Ownership context"}]` for its visible groups. The same grouping renderer supports system and class/table views: subtle enclosing boxes with top-left labels. These are visual groups, not nested or collapsible packages.

Use these visible columns as a default:

```json
[
  {"key":"name","label":"DB column"},
  {"key":"codeProperty","label":"Code property"},
  {"key":"type","label":"DB type"},
  {"key":"purpose","label":"Purpose"}
]
```

Set each field's `name` to the physical column, `type` to the verified DB type (or `unknown`), `purpose` to a short explanation, and `values.codeProperty` to the mapped property/properties (or `unmapped`/`unknown`). Put PK/FK status, nullability, defaults, converters, evidence, and inferred-purpose caveats in `details`. The renderer exposes details through information icons and the inspector. Do not substitute a code-language type for an unverified database type.

## Relationships and readable views

Use `association` for database FKs and state the arrow direction in the document. Default to **PK → FK**: the referenced table/key is `source`/`sourceMember`, and the child/referencing table/foreign key is `target`/`targetMember`. Honor a user's requested reverse convention by reversing both endpoints and their multiplicities. For a single-column FK, attach both ends to the actual field IDs. For composite FKs, use one relationship between tables and list the complete column tuple in its label/description; a single member port cannot represent a composite constraint. Place multiplicities at their respective endpoint (for example, `1` at the referenced parent and `0..n` at the child). Establish cardinality from nullability, uniqueness and verified rules; do not infer a minimum of one child from a foreign key alone. If a minimum comes from application behavior, identify that distinction. Ordinary FKs do not imply UML composition or cascade ownership.

Label ORM-only and inferred associations explicitly, describe their status, and use a distinguishable supported relation such as `dependency` rather than silently drawing them as confirmed FKs. Mention the representation in the legend; the library does not implement crow's-foot ERD semantics or an ORM parser.

Provide an overall relationship map plus readable module-focused views with full columns. Include neighboring tables needed to understand cross-module relationships, retaining their true ownership groups. Every visible relation must have both endpoints in the view. All tables remain available in appropriate focused views; do not reduce density by losing coverage. Use Read/Overview controls and the entity picker rather than claiming that every label will fit simultaneously on one screen.

Order prose and diagrams around the user's task. A useful default is introduction → module catalog/system map → schema interpretation → overall and per-module data views → coverage/uncertainties. Source identifiers are expected, but default to no code blocks. Validate/export with the companion CLI and verify the delivered artifact as described in the base skill.
