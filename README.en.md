# DSH Codex Harness

An independent plugin for DeepSeek Harness (DSH). Package: `@royalliang/dsh-codex-harness`, version `0.1.4`. GitHub repository: `RoyalLiang/dsh-codex-harness`.

The plugin uses DSH's native execution, permissions, background jobs, and subagent lifecycle to provide concise behavioral policies, safe request parameter adaptation, token/cache diagnostics from actual usage, a `Codex 模式` preset, and a Fast switch in the input bar.

## Capabilities and boundaries

- Policies address evidence and uncertainty, verification, cancellation and permissions, subagent task boundaries and real IDs, result collection, stable prompt prefixes, and preservation of unfinished goals after compression. `instructions` appends supplemental policies.
- Reasoning effort is overridden only when `ctx.llm.resolveModelInfo` confirms a matching `effort.id`; otherwise the host setting is inherited and status is `unsupported`. Model lookup and cancellation errors propagate.
- The bundle patch declares a `Codex 模式` preset (identity `codex-collaboration`). Its plugin list reuses the host `standard` composition verbatim and only replaces the persona prefix. A preset is a complete composition and inherits nothing.
- The client bundle renders a Fast switch into the input bar slot `conversation.input.right` and writes this plugin's `fast` config. The session model and its reasoning level stay in the host's own model seat; the plugin does not render a second copy of that label.
- With Fast on, `POST .../responses` bodies (including `/responses/compact`) for `gpt-*` models carry `service_tier: "priority"`; other models and non-Responses requests are untouched, and the patch is restored on dispose. The host exposes no service-tier field, so this is a guarded fetch fallback.
- Context window still expresses a request only. Public `GenerateOptions` has no corresponding interface, so status is `unsupported-public-api`; it does not increase model capacity.

DSH manages execution, file access, approvals, background jobs, cancellation, and subagent scheduling. Policies cannot grant permissions, bypass the sandbox, or guarantee model compliance. Starting a task does not establish completion, and cancellation does not imply rollback. The plugin does not rewrite host tools, the compression engine, or the subagent scheduler, claim compatibility through custom tool aliases or handwritten Responses protocol rewriting, or guarantee elimination of hallucinations.

## Installation and activation

Node.js `>=24` is required. Create a local package from the project root:

```sh
npm pack
```

The output is `royalliang-dsh-codex-harness-0.1.4.tgz`.

**For desktop, install this local tgz through Electron's plugin manager.** The `desktop` profile is managed exclusively by the Electron application. CLI installation fails with `profile "desktop" is managed exclusively by the Electron application`. Do not install through the CLI or by manually editing that profile's `package.json`. Restart the host and start a new session after installation.

Only for profiles that are not managed by Electron, use the CLI with the actual profile name and absolute archive path:

```sh
dsh plugin --profile my-profile add file:/absolute/path/royalliang-dsh-codex-harness-0.1.4.tgz --ignore-scripts
```

This command delegates installation to pnpm. The package registers the official bundle patch through `dsh.bundle.patch='./cordis.patch.yml'`, inserting the plugin row and the `Codex 模式` preset row. Registration and public patch syntax have been verified. Desktop installation results are subject to the host plugin manager's compatibility checks.

## Mode and input-bar controls

After installation and a restart, new sessions offer 「Codex 模式」 in the agent preset menu (identity `codex-collaboration`, continuing old plugin session records). The input bar keeps the host's model seat (session model and effective reasoning level) and gains a Fast switch bound to this plugin's `fast` config.

Reasoning levels come from the model catalog: models whose provider declares no `reasoningEfforts` get no level choices from the host. Add `reasoningEfforts` for such a model in the profile's `llm-pi-ai` config; the plugin does not rewrite other plugins' configuration.

## Configuration

Add the following entry to the top-level array in the actual profile's `cordis.patch.yml` to override any of the five fields below. Configuration is validated by the plugin's `Config`:

```yaml
- id: royalliang-codex-harness
  config:
    reasoningEffort: inherit
    instructions: ''
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `enabled` | boolean | `true` | Enable the plugin; `false` makes it perform no operations. |
| `fast` | boolean | `false` | Attach `service_tier: "priority"` to Responses requests for `gpt-*` models; other requests are unchanged. |
| `reasoningEffort` | string | `'inherit'` | Inherit by default; apply only effort IDs explicitly supported by model information. |
| `contextWindow` | number | `0` | `0` inherits; a positive value expresses a requested window in tokens. Currently `unsupported-public-api`. |
| `instructions` | string | `''` | Append to the built-in policies without replacing them. |

Set `disabled: true` on the same ID to prevent host mounting, or `config.enabled: false` to make the mounted plugin perform no operations.

## Usage and cache diagnostics

The only added tool, `codex_harness_status`, is read-only. It reports the most recently completed LLM call for the current `agent.session.id`, including usage, purpose, completion state, and controls. This may be an auxiliary call for compression or a session title. Interpret purpose alongside usage; this is not cumulative usage for the user's task.

- `TokenUsage.inputTokens` represents uncached input. `cacheReadTokens` and `cacheWriteTokens` account for cache reads and writes separately.
- Total input and cache read hit rate are calculated only when both cache counts are nonnegative safe integers and the other required input data is valid. Total input is uncached input plus cache reads plus cache writes; hit rate is cache reads divided by total input. A zero denominator produces `null`.
- Missing data is `null` or unknown, not zero. `totalTokens` is output only when supplied by the provider. Response speed and text length are not used to infer cache hits.

State is held in process memory for at most 128 sessions, retaining only the last completed call per session; session disposal clears its entry. It is not persistent, a bill, or an aggregate across calls. Provider accounting definitions may differ and require confirmation before comparison.

## Compatibility and development

The implementation consists of five ESM JavaScript files and one hand-written client bundle. The plugin name is `royalliang-codex-harness`. There are no ordinary runtime npm dependencies. Host-provided peers are `schemastery ^3.0.0` and `dsh-tools 0.2.1-rc.2 || 0.2.1-rc.3`.

| Layer | Development and verification record |
| --- | --- |
| Verified SDK versions | `0.2.1-rc.2`, `0.2.1-rc.3` |
| Local desktop NEXT application | `2.0.19-next`, with embedded SDK `0.2.1-rc.2` |
| Embedded desktop runtime | Node.js `24.21.0` / Electron `44.0.0` |
| This plugin | `0.1.4` |

The SDK, desktop application, embedded runtime, and plugin have separate version sequences. Compatibility with older hosts is not guaranteed. An earlier npm metadata record (modified 2026-10-23) listed `latest=0.2.1-rc.2` and `next=0.2.1-rc.3`; this is neither a live version lookup nor a compatibility promise.

Tests use Node.js's built-in test runner:

```sh
npm test
npm run check
```

The source package has completed these checks with Node.js `24.21.0`:

- A fresh `npm install` completed with 23 packages installed; `npm run check` passed.
- SDK `0.2.1-rc.2` and `0.2.1-rc.3` each ran the same `node --test` suite: 18 passed, 0 failed for each version, covering 7 behavior tests, 3 Fast fallback tests, 3 packaging and patch-structure tests, 3 client-bundle loading and registration tests, 1 SDK assertion suite, and 1 actual Cordis runtime test for loading, tool registration, disposal, reload, and disabling.
- `npm pack` passed with 11 published files; bundle registration, the `Codex 模式` preset row, and public patch syntax were verified.

No real private-model requests or token/cache savings benchmarks have been performed. These checks do not establish hot reloading of the current desktop session, model-side effectiveness, or performance savings.

## Independent implementation and security feedback

This is a new independent implementation based on this project's requirements, public interfaces, and verification results, without inheriting the previous project's implementation, documentation, or Git history.

Report ordinary issues through GitHub Issues in `RoyalLiang/dsh-codex-harness`. Do not publicly disclose credentials, private conversations, or exploitable vulnerability details. Prefer the repository's private vulnerability reporting facility when actually available. Otherwise, submit a contact request without sensitive details to arrange a disclosure channel. No dedicated security email address or response deadline is currently promised.

## License

MIT, Copyright (c) 2026 RoyalLiang. See [LICENSE](LICENSE) for the full terms.
