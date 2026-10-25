# 0.3.0

This version provides the independent Codex Harness implementation. Existing 0.2.x configuration and feature compatibility is not guaranteed; install the archive through the desktop plugin manager and start a new Codex-mode session.

- Add cumulative token usage and per-purpose diagnostics for conversation, compaction, and session-title calls. Preserve unknown counters, use token-weighted cache hit rates, and report reasoning tokens without double counting.
- Bound Codex-mode tool results to 4,096 estimated tokens using the host's recoverable spill policy. Keep complete results available through recovery paths and preserve existing budgets for other presets.
- Cap Codex-mode compaction requests at 16,384 output tokens while keeping host pressure thresholds, recent-history retention, and truncated-summary rejection.
- Refine context-loading and checkpoint guidance to reduce repeated logs and narrative.
- Include Fast live-toggle, reasoning-menu, model-display, and control-registration fixes already prepared in the workspace.

Validation: 38 checks passed on Node.js 24.21.0, including eight scenarios using actual host spill, pruning, and summarization implementations; no failures or skips. Syntax and diff checks passed. A large-log fixture decreased from 58,511 to 4,084 estimated text tokens while retaining recoverable original content. This is not a provider billing benchmark. Real-model task resumption quality and desktop installation remain unverified.

Desktop installation: install `royalliang-dsh-codex-harness-0.3.0.tgz` through the Electron plugin manager, restart the host, and create a new Codex-mode session. Do not install into the managed desktop profile through the CLI.
