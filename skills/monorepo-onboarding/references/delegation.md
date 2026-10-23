# Delegation and model defaults

These are workflow defaults, not a portable process launcher or a promise that every host provides the same models. The host's real agent tool performs delegation. User-specified choices and host limits take precedence.

| Role | Default | Scope |
| --- | --- | --- |
| Orchestrator | Main session's selected model; Opus 5.5 is a suggested Claude configuration | Inventory, assignments, reconciliation, document generation, verification |
| Module scanner | Claude plugin definition: `claude-sonnet-5-5` | Module responsibilities and architectural connections |
| Database scanner | Claude plugin definition: `claude-sonnet-5-5` | Current schema, mappings, ownership and relationship evidence |
| Concurrency | 3 workers total across both roles | Fewer for small tasks; never exceed host capacity |

Keep work read-only with respect to application source. Workers return compact findings to the orchestrator; this also works with read-only native agents that cannot create intermediate files. Break large assignments into batches before their findings become too large to return. The orchestrator persists results under `scan/findings/` and merges them once. These scans do not require running the application, migrations, dependency installation, or a live database connection.

## Claude Code with the complete plugin

The plugin's `.claude-plugin/plugin.json` explicitly registers two native agents from `host-config/claude/agents/`. Their own frontmatter sets the worker model and restricts tools to Read, Grep and Glob. They are outside the portable root `agents/` path so other hosts do not accidentally interpret Claude-specific model IDs as their own defaults.

Use Claude Code's **Agent tool** and the registered subagent type:

- `finaldiagrams:module-scanner`
- `finaldiagrams:database-scanner`

Supply the task in the tool's prompt. For example, the dispatch arguments for a module scan have this shape (this is a tool call, not a terminal command):

```json
{
  "subagent_type": "finaldiagrams:module-scanner",
  "prompt": "Inspect the assigned module paths. [Include the inventory slice, scope, findings contract/brief or their readable absolute paths, and expected result size.] Return findings only."
}
```

Use the exact names exposed by the host if the installed plugin was renamed. The worker definitions instruct agents to read the supplied contract and brief; they do not depend on automatically inheriting this skill or the main conversation. The model comes from the definition, not from saying "use Sonnet" inside the task.

If a user requests another worker model, use a supported native override or a worker definition actually configured for that model. Do not claim that changing the task text changes the execution model. Do not rewrite the user's installed configurations automatically. If the default model is unavailable, choose an available user-allowed model through the real host controls or use the sequential fallback and report it. The wrapper does not switch the main session's model.

The standalone skills archive does not install native agents into `.claude/agents/`; use the full plugin for these registered defaults. With only the two skills, use available host delegation with the same briefs, or scan sequentially.

## Codex, Copilot, and other hosts

Use the available native spawn/delegation tool, if any. Pass the assigned paths, contract and brief explicitly. Select a faster capable model through an actual supported model selector when available; do not pass Claude model IDs to a different provider or invent a tool command. The packaged `agents/openai.yaml` files are skill discovery metadata, not Codex worker-model configurations.

Respect runtime restrictions on spawning, model overrides, and concurrent agents. Reconcile results in the main agent. When delegation is absent or does not fit the task, scan the inventory in the same bounded batches in the main session. Record `native-configured`, `native-ad-hoc`, or `sequential`, plus observed model information where available, in the coverage report.

## Assignment brief

Give a worker: assignment ID; repository root and revision; assigned module IDs and paths; allowed cross-boundary schema/mapping paths; neighboring module identity map; explicit exclusions; expected findings fields; and a short result-size target. Ask it to report partial coverage if it cannot finish. Do not treat a partially returned result as a complete scan.

Sources for the Claude-specific adapter: [native agent definitions and model selection](https://code.claude.com/docs/en/sub-agents), [plugin component paths](https://code.claude.com/docs/en/plugins-reference). Host configuration is separate from the portable skill instructions.
