# Project format, version 1

The CLI validates this data contract. All data is JSON. Unknown properties survive edits and export, so retain them when modifying a project. The portable HTML embeds the canonical project, CSS and runtime; never hand-edit script tags to inject JSON.

## Whole document

```json
{
  "schemaVersion": 1,
  "id": "design-note",
  "title": "Request handling",
  "subtitle": "Optional context",
  "revision": 0,
  "entities": [],
  "relations": [],
  "diagrams": [],
  "blocks": [
    {"id": "intro-copy", "type": "prose", "markdown": "Explain the context in the user's requested form."}
  ]
}
```

Start new projects with revision 0. Revisions are nonnegative integers; connected mode manages them. Entity, relation, diagram and block IDs are globally unique across those four collections. Member IDs are unique within their entity; message IDs within their diagram. Choose readable stable IDs and resolve references by ID, never by display name.

The viewer renders the project title once. Start content with useful context or a distinct section heading; an extra heading that repeats `title` is unnecessary. Existing documents whose first heading matches the title keep that block as the title and retain its anchor/editing behavior. The compact toolbar contains search and theme/edit/save/about icons; file and import/export details live under About.

`blocks` are ordered and may repeat diagram views as needed. Supported blocks:

| Type | Required fields beyond `id`, `type` | Optional fields |
| --- | --- | --- |
| heading | `level` (1, 2 or 3), `text` | |
| prose | Exactly one of `markdown` (string) or `content` (rich-text JSON object) | |
| diagram | `diagramId` (existing diagram ID) | |
| callout | `title`, `text` | `tone`: `info` or `warning` |
| code | `text` | `language` |
| image | `src` (embedded image data URL), `alt` | `caption` |

Visual prose editing replaces `markdown` with structured `content`. Retain that object for existing prose; do not stringify it or leave both representations. The supported basic rich-text format uses a `doc` with `content` nodes such as `paragraph`, `heading`, `bulletList`, `orderedList`, `listItem` and `text`; text may have `bold`, `italic` or `code` marks. This compatible JSON representation does not imply a Tiptap runtime dependency or support for arbitrary editor extensions. Use Markdown for newly authored text unless structured content is needed.

An `image` block embeds its bytes in the canonical model, so it survives JSON export and Save HTML without a companion file. Supported data URL media types are `image/png`, `image/jpeg`, `image/webp` and `image/gif`; use base64 encoding. External URLs and SVG are not supported image block sources. The UI image upload creates embedded blocks. This valid one-pixel PNG illustrates the schema; use descriptive `alt` text for meaningful document images:

```json
{
  "id": "reference-image",
  "type": "image",
  "src": "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=",
  "alt": "One-pixel image used to illustrate embedded image data",
  "caption": "Replace this sample with the document's reference image."
}
```

## Entities and members

An entity has `id`, `kind`, `name` and optional `summary`, `description`, `technology`, `group`, `fields`, `methods`, `source`, `tone`.

Kinds: `actor`, `service`, `module`, `library`, `database`, `queue`, `external`, `class`, `interface`, `table`, `state`, `choice`, `initial`, `final`. `module` is a generic project/component boundary; `library` is an internal code library (runtime 0.2+). State kinds require runtime 0.3+. Use `export` to upgrade an older HTML when introducing newer kinds. `group` matches a group ID in a system, class/table or state diagram. A `source` object requires `path`; `line` is an optional positive integer and `url` is optional. Omit `source` for invented examples and unsourced inference.

`tone` is an optional semantic color: `neutral`, `info`, `success`, `warning` or `error`. Use it for state emphasis, with explicit names/labels so color is never the only indication. Arbitrary CSS colors are not accepted.

`fields` and `methods` are arrays of members:

```json
{
  "id": "accept-order",
  "name": "accept()",
  "type": "OrderAccepted",
  "purpose": "Checks the transition and records acceptance.",
  "details": "Called after stock and payment checks.",
  "visibility": "public",
  "values": {"invariant": "Only from Pending"}
}
```

Only member `id` and `name` are required. Other fields are strings. `values` maps custom column keys to strings.

## Relations

Required: `id`, `source`, `target`, `label` (may be empty), `kind`. Endpoints refer to entities. Optional: `description`, `sourceMember`, `targetMember`, `sourceMultiplicity`, `targetMultiplicity`, `tone`. A member reference must exist on that endpoint's entity. Relation tones use the same enum as entities.

Kinds: `calls`, `async`, `reads`, `writes`, `association`, `inheritance`, `implementation`, `composition`, `aggregation`, `dependency`, `transition`. For class relationships, put a whole/owner at the **source** of composition or aggregation. An inheriting class points **from the subtype to the base type**; an implementation points **from the implementing class to the interface**. These endpoint meanings determine UML markers. Transitions connect only state kinds; an initial marker cannot receive a transition and a final marker cannot send one.

For a database view showing **PK → FK**, put the referenced table/key at `source`/`sourceMember` and the referencing table/foreign key at `target`/`targetMember`. Both member values are field IDs, not display names. Example: `{ "id": "order-items", "source": "orders", "sourceMember": "order-pk", "target": "items", "targetMember": "item-order-fk", "kind": "association", "label": "contains", "sourceMultiplicity": "1", "targetMultiplicity": "0..n" }`. Multiplicities are displayed at their respective endpoint: each item references one order; an order can have zero or many items. `1..n` means at least one; distinguish an application-enforced minimum from a database constraint. Standard UML `0..*`/`1..*` is also accepted. Use the notation requested by the user consistently and explain it briefly. Composite foreign keys require the full column tuple in the label/details; attaching one member does not represent the entire constraint.

## Diagram views

Required: `id`, `type` (`system`, `class`, `sequence`, `state`), `title`, `entityIds`. Optional: `description`, `relationIds`, `direction` (`RIGHT` or `DOWN`), `notation` (`uml` or `plain`), `columns`, `positions`, `groups`, `messages`.

Every relation included in a view must have both endpoints in that view's `entityIds`. Include only relevant relationships to control density. Each view stores its own manual `positions` as `{ "entity-id": {"x": 120, "y": 80} }`; coordinates must be finite numbers. Omit positions for new automatic layouts, and remove stale positions after changing a view's entity membership.

System, class/table and state grouping uses `groups: [{"id":"services","label":"Services","description":"Owned components"}]` and matching entity `group` values. Groups render as subtle containers with top-left labels; they are not nested/collapsible packages or composite state machines. Classes may use `columns: [{"key":"name","label":"Member"},{"key":"type","label":"Type"},{"key":"purpose","label":"Purpose"},{"key":"invariant","label":"Invariant"}]`. Built-in keys read member properties; custom keys read `member.values[key]`.

Sequence `entityIds` define participant order. Ordered `messages` carry runtime semantics independently of `relationIds`:

```json
{
  "id": "request-accepted",
  "from": "api",
  "to": "client",
  "label": "201 Created",
  "kind": "return",
  "description": "The accepted record is already durable.",
  "phase": "Respond"
}
```

All message participants must appear in the diagram. Kinds are `sync`, `async`, `return`. `description` and `phase` are optional strings. A phase is an explanatory caption, not a formal UML combined fragment. Avoid inventing message order from code dependencies alone.

## State diagrams (runtime 0.3+)

State views contain only `state` (rounded box), `choice` (diamond), `initial` (filled circle) and `final` (bullseye) entities. Every entity has a name, including markers, for search and accessible inspection. Relations in the view must be `transition`. A transition label can follow `event [condition] / action`, but it remains plain text, not executable logic. Put longer conditions and caveats in `description`.

Branches use a choice node and explicit outgoing conditions. Self-transitions have the same source/target ID. Return transitions point back to the original state ID; do not duplicate a state just to make a linear drawing. Initial and final markers are optional; a repeating lifecycle need not have a final state. The default layout direction is `DOWN`; `RIGHT` is also supported.

For example, these entries describe an error that clears on blur only:

```json
{
  "entities": [
    {"id":"regular","kind":"state","name":"Regular state"},
    {"id":"error","kind":"state","name":"Error state","tone":"error"}
  ],
  "relations": [
    {"id":"invalid","kind":"transition","source":"regular","target":"error","label":"Save or blur [invalid]","tone":"error"},
    {"id":"recover","kind":"transition","source":"error","target":"regular","label":"Blur [valid]","tone":"success","description":"Typing or Save alone does not clear an existing error."}
  ],
  "diagrams": [
    {"id":"validation","type":"state","title":"Validation states","entityIds":["regular","error"],"relationIds":["invalid","recover"]}
  ]
}
```

These are entries for the corresponding project arrays, not a complete project. Add the usual project metadata and a diagram block. The viewer supports visual inspection/editing and SVG export; it does not simulate transitions or implement nested/concurrent states, history pseudostates or formal UML execution semantics.
