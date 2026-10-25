# DSH Codex Harness

[简体中文](README.md)

A Codex-style coding-agent preset, input-bar controls, and token-usage diagnostics for DeepSeek Harness (DSH). It uses the host's tools, permissions, and task lifecycle to manage context, preserve task progress, and verify results.

## Features

- **Codex mode**: coding collaboration policies covering scope checks, verification, background-task tracking, and continuity after compaction.
- **Context management**: concise previews of large tool results with paths to the originals, plus a separate summary output budget.
- **Fast toggle**: live configuration of the priority service parameter for applicable GPT Responses requests.
- **Reasoning selection**: options based on advertised model capabilities. Existing choices are preserved; new selections prefer High when supported.
- **Usage diagnostics**: latest-call and cumulative token metrics, grouped by conversation, compaction, and session-title purpose.

## Installation

### Requirements

- Node.js **24 or later**.
- A compatible DSH host providing `dsh-tools 0.2.1-rc.2` or `0.2.1-rc.3` and `schemastery ^3.0.0`.
- Models and providers configured in the host. The plugin does not include model accounts or credentials.

### Desktop application

1. Obtain the plugin's `.tgz` archive. To build from source, run `npm pack --ignore-scripts` in the project directory and use the filename printed by the command.
2. Install that file through the DSH desktop plugin manager.
3. Restart the host, create a new session, and select **Codex 模式** (Codex mode).

The application manages the `desktop` profile; use its plugin manager for installation. Existing sessions do not automatically change presets. See the [release notes](RELEASE_NOTES.md) for version changes.

### CLI profiles

For profiles not managed by the desktop application, substitute the actual profile name and absolute archive path:

```sh
dsh plugin --profile my-profile add file:/absolute/path/plugin.tgz --ignore-scripts
```

## Usage

Toggle Fast or select a reasoning effort in the input bar. Changes apply to subsequent requests. Fast is plugin-wide; reasoning selections are saved for the current session and model.

- **Fast**: adds `service_tier: "priority"` only to Responses requests for `gpt-*` models. Acceptance and billing are determined by the provider.
- **Reasoning**: only explicitly supported options are submitted to the host. Without capability metadata, the list saves a local preference without changing model requests; the interface explains this limitation.
- **Status**: ask the agent to call the read-only `codex_harness_status` tool to inspect control support and actual usage. Missing metrics remain `null`.

The host continues to manage tool execution, permissions, approval, cancellation, and subagent scheduling. Policies do not grant additional permissions, and cancellation does not undo changes already made.

### Image input

Codex mode uses the selected model's image capability. If sending an image reports that the model does not support images, check the provider configuration: custom `dsh-llm-pi-ai` models absent from its built-in catalog default to text input. After verifying that the model on that gateway supports images, declare the accepted input types on that model entry:

```yaml
models:
  - id: your-vision-model
    input: [text, image]
```

This field belongs to the host's provider configuration, not the Codex plugin. Do not enable it for unverified models; a declaration does not give a text-only model vision. Confirm that the host has loaded the saved configuration before sending an image; restart the host if its capability list has not updated.

## Configuration

Edit these fields in the host's plugin settings. Keep `reasoningEffort: inherit` when using the input-bar selector.

| Field | Default | Behavior |
| --- | --- | --- |
| `enabled` | `true` | Enables request adaptation, behavior policies, and usage observation. |
| `fast` | `false` | Enables the priority service parameter for applicable requests. |
| `reasoningEffort` | `inherit` | Inherits the host setting; other values override only when explicitly supported by the model. |
| `contextWindow` | `0` | Inherits at `0`. The public API does not support overriding the window; positive values report `unsupported-public-api`. |
| `instructions` | Empty string | Appends instructions to the built-in behavior policy. |

### Context budgets

Codex mode configures these budgets through host preset child plugins. They are separate from the fields above:

| Setting | Budget | Behavior |
| --- | --- | --- |
| Tool-result preview | 4,096 estimated tokens | Retains head/tail previews and recovery paths before results enter history. |
| Summary output | 16,384 tokens | Caps each summary request, including provider-counted reasoning tokens. |

`read` bypasses this preview policy for incremental recovery. Previews can contain multiple recovery-path layers. Storage failure or unavailable image pricing or recovery preserves the original result, so the budget is not a hard cap on every result. Content already discarded by a tool cannot be recovered.

The host's compaction trigger threshold and recent-history budget remain unchanged. The host rejects truncated summaries; increase the preset child-plugin budget if real requests repeatedly hit the limit. Setting the plugin's `enabled` field to `false` does not undo preset budget configuration.

## Usage and cache metrics

`codex_harness_status` returns `controls`, `usage`, `totals`, and `byPurpose`. Metrics appear only when requested, without adding statistics to each model prompt.

- DSH counts uncached input, cache reads, and cache writes separately. Total input is their sum.
- Cumulative cache hit rates are token-weighted. Missing, invalid, or overflowing counters remain unknown rather than becoming zero.
- Reasoning tokens are reported separately without being added again to output or totals. Only the final usage snapshot is recorded; failed and early-closed streams also count as calls.
- Metrics stay in memory for up to 128 active sessions. Session disposal, plugin unloading, or process restart clears them. Late streams cannot restore reports for disposed or evicted sessions.

These metrics are not a complete bill, do not aggregate subagent sessions, and do not estimate cost. Smaller text estimates do not establish actual token or cost savings.

## Development and testing

Install dependencies and run checks from the source directory:

```sh
npm ci
npm test
npm run check
```

Regular tests cover usage aggregation, configuration, input-bar controls, Fast request adaptation, and host lifecycle behavior.

Optional host scenarios require compatible host packages. Set `DSH_CONTEXT_HOST_ROOT` to a directory containing their `node_modules`, then run the tests. For example, in PowerShell:

```powershell
$env:DSH_CONTEXT_HOST_ROOT = 'C:\path\to\host'
npm test
```

The directory must provide `dsh-spill-policy`, `dsh-spill-local`, `dsh-token-meter`, `dsh-compaction-basic`, `dsh-compaction-tool-result-pruner`, their dependencies, and `yaml`. An unset variable explicitly skips the scenario group; a configured but incomplete directory fails. Scenarios cover log recovery, isolation, failure fallback, cancellation, image preservation, and truncated summaries. Scripted model streams do not test real-model task resumption quality.

## Contributing and support

Issues and pull requests focused on a single problem are welcome. Include the host version, model adapter, reproduction steps, and redacted logs in bug reports. Add relevant tests for behavior changes.

Do not include credentials or private conversations in public reports. Use the repository's private reporting channel for security vulnerabilities when available.

## License

[MIT](LICENSE)
