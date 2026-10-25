# DSH Codex Harness

An independent plugin for DeepSeek Harness (DSH). Package: `@royalliang/dsh-codex-harness`, version `0.3.0`. GitHub repository: `RoyalLiang/dsh-codex-harness`.

The plugin uses DSH's native execution, permissions, background jobs, and subagent lifecycle to provide concise behavioral policies, safe request parameter adaptation, token/cache diagnostics from actual usage, a `Codex 模式` preset, and a Fast switch in the input bar.

## Capabilities and boundaries

- Policies address evidence and uncertainty, verification, cancellation and permissions, subagent task boundaries and real IDs, result collection, stable prompt prefixes, and preservation of unfinished goals after compression. `instructions` appends supplemental policies.
- Reasoning effort is overridden only when `ctx.llm.resolveModelInfo` confirms a matching `effort.id`; otherwise the host setting is inherited and status is `unsupported`. Model lookup and cancellation errors propagate.
- The bundle patch declares a `Codex 模式` preset (identity `royalliang-codex`), reusing the host's `standard` tools with a Codex persona and tighter tool-output and summary budgets. A preset is a complete composition and inherits nothing.
- The client bundle adds a Fast switch and a reasoning-effort selector to `conversation.input.right`. Fast uses this plugin's live `fast` setting without reloading. Reasoning reads and writes supported efforts through the host's `modelDirectories` service; missing metadata exposes a local preference list defaulting to High. Failed writes show an error.
- With Fast on, `POST .../responses` bodies (including `/responses/compact`) for `gpt-*` models carry `service_tier: "priority"`; other models and non-Responses requests are untouched, and the patch is restored on dispose. The host exposes no service-tier field, so this is a guarded fetch fallback.
- Context window still expresses a request only. Public `GenerateOptions` has no corresponding interface, so status is `unsupported-public-api`; it does not increase model capacity.

DSH manages execution, file access, approvals, background jobs, cancellation, and subagent scheduling. Policies cannot grant permissions, bypass the sandbox, or guarantee model compliance. Starting a task does not establish completion, and cancellation does not imply rollback. The plugin does not rewrite host tools, the compression engine, or the subagent scheduler, claim compatibility through custom tool aliases or handwritten Responses protocol rewriting, or guarantee elimination of hallucinations.

## Installation and activation

Node.js `>=24` is required. Create a local package from the project root:

```sh
npm pack
```

The output is `royalliang-dsh-codex-harness-0.3.0.tgz`.

**For desktop, install this local tgz through Electron's plugin manager.** The `desktop` profile is managed exclusively by the Electron application. CLI installation fails with `profile "desktop" is managed exclusively by the Electron application`. Do not install through the CLI or by manually editing that profile's `package.json`. Restart the host and start a new session after installation.

Only for profiles that are not managed by Electron, use the CLI with the actual profile name and absolute archive path:

```sh
dsh plugin --profile my-profile add file:/absolute/path/royalliang-dsh-codex-harness-0.3.0.tgz --ignore-scripts
```

This command delegates installation to pnpm. The package registers the official bundle patch through `dsh.bundle.patch='./cordis.patch.yml'`, inserting the plugin row and the `Codex 模式` preset row. Registration and public patch syntax have been verified. Desktop installation results are subject to the host plugin manager's compatibility checks.

## Mode and input-bar controls

After installation and a restart, new sessions offer 「Codex 模式」 in the agent preset menu (identity `royalliang-codex`). The input bar retains the host's model seat and adds a native Fast slider that turns green when enabled and a reasoning list using DSH's native button and menu, without a visible reasoning label. The current session's selected model name appears separately below the input. Model selection takes effect for subsequent requests.

Conversation history uses the host's native turn rail on the left, retaining scrolling, navigation, and hover previews that open to the right. No separate history panel is added below the input.

Every list-slot registration now has a unique ID, fixing the host's rejection of the Fast and reasoning controls.

Models advertising reasoning expose their actual choices. Sessions without an explicit selection prefer High when supported; existing choices remain unchanged. Without metadata, the list offers ◔ Low, ◑ Medium, ◕ High, ● Extra high, and ✦ Max, defaulting to High, but saves only a browser-local preference per session and model. Its tooltip explains that no effort is submitted to the host. The current AGY GPT-6.1 Sol has no reasoning metadata and its adapter does not forward GPT effort, so these choices cannot yet affect that model. The selector is disabled during loading or saving. Keep the advanced plugin `reasoningEffort` setting at `inherit` when using the selector, since an explicit supported override still takes precedence at request time. Fast is a plugin-wide preference.

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

The only added tool, `codex_harness_status`, is read-only. For the current `agent.session.id`, it returns controls, the latest settled call as `usage`, cumulative `totals`, and cumulative `byPurpose` groups. The original `usage` field is preserved. Auxiliary compression or title calls may replace the latest call but do not overwrite accumulated counters. Statistics are returned only when the tool is called; they are not appended to every model request.

- `TokenUsage.inputTokens` represents uncached input; `cacheReadTokens` and `cacheWriteTokens` are separate counts. These are DSH-normalized disjoint counters, unlike the inclusive raw OpenAI `input_tokens` field.
- Total input is uncached input plus cache reads plus cache writes. Cumulative hit rate is summed cache reads divided by summed total input, not an average of per-call rates. A zero denominator produces `null`.
- Each aggregate includes `calls`, `unknownUsageCalls`, `incompleteCalls`, and token counters. Failed or early-closed streams also count as calls. Missing usage increments `unknownUsageCalls`; missing finish reason increments `incompleteCalls`. Neither fabricates zero usage. If a stream emits multiple usage chunks, only the last is counted.
- `byPurpose` separates `conversation`, `compaction`, and `session-title`; unfamiliar purposes share `other` to bound group count. Missing data in one purpose does not invalidate another purpose's independent totals.
- If a metric is missing or invalid for any call, or its sum exceeds the safe integer range, that aggregate metric stays `null`. Later valid data cannot turn an incomplete total into a complete one. Total input and hit rate also remain `null` when required counters are missing.
- `totalTokens` is reported only when supplied by the provider. `reasoningTokens` is reported separately, or `null` when missing, and is not added again to output or total tokens. Response speed and text length are not used to infer cache hits.

Statistics begin with calls observed after plugin mounting. They are held in memory for at most 128 recently active sessions and cleared on session disposal, plugin disposal, or process restart. An evicted session starts fresh if observed again. This is not a complete session bill, does not include child sessions, and does not estimate cost. Token totals across model switches do not imply a shared price.

## Context and token optimization

The built-in policy scopes searches and reads, returns concise findings and decisive errors, and keeps large logs and data in retrievable files. Checkpoints focus on the current goal, constraints, decisions, changed paths, validation, unresolved errors, outstanding job IDs, and the next action, omitting consumed logs and repeated narrative while preserving validation evidence and tool-call/result pairs. This is behavioral guidance, not enforced truncation. The policy is registered on mount; accumulated statistics do not rewrite the stable prefix.

The Codex preset mounts the host's `dsh-spill-policy` in its own scope with a shared text/image budget of **4,096 estimated tokens** per tool result. Before history is appended, oversized results retain head/tail previews and a path to the full content. It reuses the base spill store without changing other presets' budgets. `read` bypasses this policy for incremental recovery. Missing storage, image pricing, or readable image paths preserves the original content, so this is not a hard cap on every result. Earlier tool-owned truncation cannot be recovered.

The base policy may first reduce a large result to 12,500 estimated tokens before Codex reduces it to 4,096. This can produce two recovery-path layers; following the paths retrieves the full original. The later host pruner still retains the first 4,096 and last 1,024 Unicode code points when text exceeds 8,192 code points. Scenario tests check recovery-path preservation and one-pass convergence.

Codex sets `compaction-basic.maxTokens` to **16,384**, a per-summary output ceiling including provider-counted reasoning tokens, not a target summary length. The host trigger threshold, headroom, and recent-history budget remain unchanged; no compaction engine is added. The host rejects summaries ending with `max-tokens`. Raise the preset child-plugin budget if real requests repeatedly hit it. These budgets belong to the preset composition, not the plugin Config table above; `enabled: false` does not undo the preset composition.

Compare similar long tasks using calls, input, and output in `byPurpose.conversation` and `byPurpose.compaction`, alongside host compaction events, latency, and completion quality. Before/after context sizes, cache-invalidation causes, and costs are outside this interface; the latest usage cannot establish a compression ratio. Missing metrics remain unknown and no savings percentage is claimed.

## Compatibility and development

The implementation consists of five ESM JavaScript files and one hand-written client bundle. The plugin name is `royalliang-codex-harness`. There are no ordinary runtime npm dependencies. Host-provided peers are `schemastery ^3.0.0` and `dsh-tools 0.2.1-rc.2 || 0.2.1-rc.3`.

| Layer | Development and verification record |
| --- | --- |
| Verified SDK versions | `0.2.1-rc.2`, `0.2.1-rc.3` |
| Local desktop NEXT application | `2.0.19-next`, with embedded SDK `0.2.1-rc.2` |
| Embedded desktop runtime | Node.js `24.21.0` / Electron `44.0.0` |
| This plugin | `0.3.0` |

The SDK, desktop application, embedded runtime, and plugin have separate version sequences. Compatibility with older hosts is not guaranteed. An earlier npm metadata record (modified 2026-10-23) listed `latest=0.2.1-rc.2` and `next=0.2.1-rc.3`; this is neither a live version lookup nor a compatibility promise.

Tests use Node.js's built-in test runner:

```sh
npm test
npm run check
```

With host scenarios enabled, Node.js `24.21.0` passed **38 checks, with 0 failures and 0 skips**. Alongside usage, controls, Fast, and Cordis lifecycle regression checks, eight new scenarios cover short output, incremental reads, full-log recovery, later pruning with readable paths, ordinary-session isolation, repeated output without history mutation, storage failure, tool failure, cancellation, unavailable image pricing, and truncated summaries. `npm run check`, scenario syntax checking, and `git diff --check` passed.

`test/context-scenarios.test.js` uses actual host packages without adding project dependencies. Set `DSH_CONTEXT_HOST_ROOT` to a directory containing host `node_modules`: it must include `dsh-spill-policy`, `dsh-spill-local`, `dsh-token-meter`, `dsh-compaction-basic`, `dsh-compaction-tool-result-pruner`, their dependencies, and `yaml`. Without the variable, normal tests explicitly skip the host scenario group. With it, missing packages fail. This machine stages packages from the installed host in the ignored `.audit/context-runtime` directory. Reproduce with Node.js >=24:

```powershell
$env:DSH_CONTEXT_HOST_ROOT = (Resolve-Path '.audit/context-runtime').Path
node --test --experimental-test-isolation=none
```

The scenarios use host `0.2.1-rc.2` spill, pruning, and summarization implementations alongside the workspace tool runtime. The large-log fixture decreased from **58,511 to 4,084 estimated text tokens**, with the complete original and middle error recovered from real temporary files. This uses the host text estimate, not provider usage. Summary responses use a scripted stream to check prefix preservation, budget forwarding, and truncation rejection; this does not test the complete compaction transaction or real-model task resumption quality. Test recovery files are cleaned up afterward.

No real private-model requests or cost benchmarks have been performed, and no new package has been installed in the desktop application. These checks do not establish hot reloading of the current desktop session, model-side effectiveness, or performance savings.

## Independent implementation and security feedback

This is a new independent implementation based on this project's requirements, public interfaces, and verification results, without inheriting the previous project's implementation, documentation, or Git history.

Report ordinary issues through GitHub Issues in `RoyalLiang/dsh-codex-harness`. Do not publicly disclose credentials, private conversations, or exploitable vulnerability details. Prefer the repository's private vulnerability reporting facility when actually available. Otherwise, submit a contact request without sensitive details to arrange a disclosure channel. No dedicated security email address or response deadline is currently promised.

## License

MIT, Copyright (c) 2026 RoyalLiang. See [LICENSE](LICENSE) for the full terms.
