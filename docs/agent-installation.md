# Agent installation and support

Use a **built release**, including its runtime and references. Node.js 20+ must be available to the agent's terminal. No MCP server or API key is needed. Generate documents in the user's workspace; installed plugin directories may be read-only.

## Choose a release

| Archive | Contents | Use |
| --- | --- | --- |
| `finaldiagrams-plugin.zip` | Both skills, one runtime at the plugin root, host configuration, docs and examples | Complete plugin installation; includes native Claude worker definitions |
| `finaldiagrams-skills.zip` | Sibling `finaldiagrams/` and `monorepo-onboarding/` skill directories; runtime in the base skill's assets | Install both portable skills together |
| `finaldiagrams-copilot-skills.zip` | Same two directories, with the onboarding skill named `finaldiagrams:monorepo-onboarding` | Copilot CLI standalone installation with a prefixed command |
| `finaldiagrams-skill.zip` | Only the standalone `finaldiagrams/` skill and its runtime assets | General document creation without the onboarding wrapper |

`finaldiagrams` creates and edits complete technical documents using the packaged HTML runtime. `monorepo-onboarding` inspects a repository, gathers module and database evidence, reconciles findings and uses the base skill to produce an onboarding document. The wrapper shares the base runtime; it contains no second renderer or JavaScript bundle.

## Install standalone skills

For both skills, extract `finaldiagrams-skills.zip` and copy its two top-level directories into the same skills directory. Preserve the `finaldiagrams/assets/`, `scripts/`, `references/` and the wrapper's references. For the base skill alone, extract `finaldiagrams-skill.zip` and copy its top-level `finaldiagrams/` directory.

| Host | Repository directory for the two sibling skills | Personal directory |
| --- | --- | --- |
| Codex | `.agents/skills/` | `~/.agents/skills/` |
| Claude Code | `.claude/skills/` | `~/.claude/skills/` |
| GitHub Copilot CLI / VS Code | `.github/skills/` | `~/.copilot/skills/` |

Codex supports explicit skill invocation such as `$monorepo-onboarding` or `$finaldiagrams`. [OpenAI skill documentation](https://learn.chatgpt.com/docs/build-skills)

Claude Code discovers skills in project or user skill directories. [Claude Code skill documentation](https://code.claude.com/docs/en/skills)

Copilot CLI supports project and personal skill directories; VS Code also supports the Agent Skills format. [Copilot CLI skills](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/add-skills), [VS Code skills](https://code.visualstudio.com/docs/agent-customization/agent-skills)

The skills bundle does **not** install native Claude worker configurations. In a standalone installation, the onboarding workflow uses the host's available delegation tools and model controls. If delegation is unavailable, the main agent performs the scans itself. Other hosts may choose their own models and cannot be assumed to honor Claude-specific model identifiers or worker configuration.

Do not copy only `skills/finaldiagrams/` out of the plugin archive: that version resolves the enclosing plugin's runtime. Use the standalone archive when copying individual skill directories.

## Copilot CLI: prefixed onboarding command

Use `finaldiagrams-copilot-skills.zip` for `/finaldiagrams:monorepo-onboarding` in Copilot CLI. The packager changes only the onboarding skill's frontmatter name; the folder stays `monorepo-onboarding`, preserving relative references to the base skill. `/finaldiagrams` remains available for general documents.

From this Windows source checkout, install or update the two personal skills with:

```powershell
Expand-Archive `
  -LiteralPath "C:\Projects\FinalDiagrams\artifacts\finaldiagrams-copilot-skills.zip" `
  -DestinationPath "$env:USERPROFILE\.copilot\skills" `
  -Force
```

Adjust the ZIP path for a downloaded release. For repository-only installation, use the target repository's `.github/skills` directory as the destination. This replaces the prior portable onboarding skill in the same folder, so no folder rename or extra alias is needed. If an older copy exists in another discovered skills directory, remove that duplicate from discovery to avoid retaining the short command.

Start a new Copilot CLI session in the target repository, or run `/skills reload`, then `/skills list`. The entries should include `finaldiagrams` and `finaldiagrams:monorepo-onboarding`. Node.js 20+ is required by the document CLI.

Copilot CLI explicitly supports colon-qualified skill names in its [skill frontmatter reference](https://docs.github.com/en/copilot/reference/copilot-cli-reference/cli-command-reference#skill-frontmatter-fields). This ZIP is specific to **Copilot CLI**. VS Code requires unqualified skill names and adds the prefix when loading a plugin; use the full plugin there instead of this ZIP. See [VS Code skill names](https://code.visualstudio.com/docs/agent-customization/agent-skills#header-required).

## Load the complete plugin

Extract `finaldiagrams-plugin.zip` and keep its top-level `finaldiagrams/` directory intact. The root `plugin.json`, `.codex-plugin/plugin.json` and `.claude-plugin/plugin.json` describe the same packaged skills through their respective discovery rules. Root plugin manifests are documented by [OpenAI](https://developers.openai.com/plugins/build/plugins) and [GitHub](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating); see also [Claude's manifest reference](https://code.claude.com/docs/en/plugins-reference).

- **Codex:** use the host's local plugin installation flow, or install the standalone skills above. Plugin UI and installation scope depend on the host.
- **Claude Code:** run `claude --plugin-dir /absolute/path/to/finaldiagrams`, then invoke `/finaldiagrams:monorepo-onboarding`. For a general document, invoke `/finaldiagrams:finaldiagrams`. Local plugin loading is documented in the [Claude plugin overview](https://code.claude.com/docs/en/plugins). The execution target is Claude Code with a local Node terminal; Claude web chat and Cowork are not claimed as supported execution hosts.
- **Copilot CLI:** run `copilot plugin install /absolute/path/to/finaldiagrams`, then inspect `copilot plugin list` and `/skills list` in a new interactive session. [GitHub plugin installation documentation](https://docs.github.com/en/copilot/how-tos/copilot-cli/customize-copilot/plugins-creating). In other surfaces, attach or select `monorepo-onboarding` through the host's supported skill workflow.
- **Copilot in VS Code:** register the intact plugin directory in user settings, merging into any existing `chat.pluginLocations` object:

  ```json
  "chat.pluginLocations": {
    "C:/Projects/FinalDiagrams": true
  }
  ```

  Use the actual plugin directory if extracted elsewhere. VS Code contributes `/finaldiagrams:monorepo-onboarding` from the plugin's name and the unqualified skill name. [Local plugin registration](https://code.visualstudio.com/docs/agent-customization/agent-plugins#use-local-plugins). Keep standalone copies out of discovery if you want only plugin-prefixed entries.

Avoid duplicate plugin and standalone installations unless you intend to expose both entries.

## Delegation and model settings

The full plugin supplies Claude worker definitions at `host-config/claude/agents/module-scanner.md` and `database-scanner.md`, registered by its Claude manifest. Their configured default model is `claude-sonnet-5-5`; the onboarding workflow permits at most **three concurrent workers**. The main agent's model is selected by the host. Opus 5.5 is suggested for the coordinating agent, but the plugin does not pin it.

Model choices and concurrency can be overridden by the user's instructions and the host's available controls; a plugin owner can also edit the worker definitions before installation. Model availability, permitted identifiers and delegation behavior depend on the host and account. Portable skill installation does not guarantee these Claude-specific settings in Codex, Copilot or another agent.

## Invoke a workflow

In Claude Code or VS Code with the full plugin, or Copilot CLI with the dedicated skill bundle:

```text
/finaldiagrams:monorepo-onboarding Inspect this repository and create an evidence-backed onboarding guide as one editable offline HTML file.
```

In Codex with the standalone skills:

```text
Use $monorepo-onboarding to inspect this repository and create an onboarding guide with module responsibilities, database usage, key flows and source references.
```

In another supported host, attach or select the `monorepo-onboarding` skill and provide the repository and desired audience. For a design note or another document that does not require the repository scanning workflow, select `finaldiagrams` directly. Save browser edits with **Save HTML** to download an updated copy.

## What is verified

Automated release checks use Python's standard ZIP reader to verify archive integrity and extraction, inspect packaged references and runtime placement, then run each extracted base CLI to validate, export and extract a document without `node_modules`. Browser checks cover the editable offline artifact and connected synchronization.

Claude Code's `claude plugin validate .` accepted the source plugin. Its only warning was the missing optional `author` field. This verifies the plugin's metadata and layout; it does not exercise native worker dispatch or an LLM onboarding run.

An independent agent followed the onboarding skill against the four-project fixture in `test/fixtures/onboarding-monorepo/`, using sequential scans. It recovered five tables, 21 current columns and two database foreign keys, reconciled migration renames/drops, and retained unclear ownership instead of inventing a mapping. The resulting HTML passed offline search, editing, Save HTML and reopen checks. This checks the research-to-document workflow on a small fixture; it does not establish large-repository coverage or native Claude worker execution.

Copilot CLI 1.0.97 was checked with isolated configuration directories: local plugin installation/discovery succeeded, and the dedicated standalone bundle was discovered with the exact enabled skill name `finaldiagrams:monorepo-onboarding`. The plain portable plugin's discovery list reported the unqualified name, so use the dedicated CLI bundle when the colon-qualified name is required.

These checks do not exercise native worker invocation, model selection or a complete LLM onboarding run in Codex, Claude Code or Copilot. VS Code UI discovery was not exercised. Do not report those behaviors as tested merely because metadata, discovery or archive checks pass.

The built runtime and full dependency notices travel with every release; full notices are also embedded in each exported HTML. Document generation from a release needs no build tooling or `node_modules`.
