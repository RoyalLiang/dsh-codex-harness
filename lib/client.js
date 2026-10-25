window.__ModuleLoader__.load({
  id: "@royalliang/dsh-codex-harness",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    const React = require("react");
    const primitives = require("@deepseek-ai/dsh-client-ui-primitives");

    const ENTRY = "royalliang-codex-harness";
    const SLOT = "conversation.input.right";
    const tagId = "@royalliang/dsh-codex-harness/client.css";
    if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
      const tag = document.createElement("style");
      tag.dataset.plugin = "@royalliang/dsh-codex-harness";
      tag.dataset.pluginCss = tagId;
      // shortcut: host CSS-module names are version-specific; recheck when DSH updates TurnNavigator.
      tag.textContent = ".rcx_fast{align-items:center;gap:4px;display:inline-flex;font-size:12px}.rcx_fast_switch[aria-checked='true']{background:var(--dsw-alias-state-success-primary,#22a06b)}nav._9dNBWq_frame{left:12px;right:auto}nav._9dNBWq_frame ._9dNBWq_mark:before{left:0;right:auto;transform-origin:0}nav._9dNBWq_frame ._9dNBWq_preview{left:calc(100% + 8px);right:auto}";
      document.head.appendChild(tag);
    }

    /** Fast follows the Host's live configuration form. */
    function FastToggle({ form }) {
      const state = React.useSyncExternalStore(
        (notify) => form.subscribe(notify),
        () => form.getSnapshot(),
      );
      const [error, setError] = React.useState("");
      const fast = state?.value?.fast === true;
      const locked = state?.status !== "ready" || state?.writable !== true;
      return React.createElement("span", { className: "rcx_fast" },
        React.createElement("span", null, "Fast"),
        React.createElement(primitives.Switch, {
          className: "rcx_fast_switch",
          checked: fast,
          label: "Fast 模式",
          title: locked ? "插件配置当前不可写" : "开启后 gpt-* 模型的 Responses 请求附带 service_tier=priority",
          disabled: locked,
          onChange: async (next) => {
            setError("");
            try {
              if (!await form.set("fast", next)) setError("Fast 保存失败，请重试");
            } catch { setError("Fast 保存失败，请重试"); }
          },
        }),
        error ? React.createElement("span", { role: "alert" }, error) : null);
    }

    function ReasoningSelect({ directory, available, sessionId }) {
      const state = React.useSyncExternalStore(
        (notify) => directory.store.subscribe(notify),
        () => directory.store.getSnapshot(),
      );
      React.useEffect(() => { if (available) directory.load().catch(() => {}); }, [directory, available]);
      const [error, setError] = React.useState("");
      const current = state.current;
      const model = state.groups.find((group) => group.id === current?.provider)?.models.find((item) => item.id === current?.model);
      const reasoning = model?.reasoning;
      const [open, setOpen] = React.useState(false);
      const icons = { low: "◔", medium: "◑", high: "◕", xhigh: "●", max: "✦" };
      const efforts = reasoning?.efforts?.length ? reasoning.efforts : [
        { id: "low", name: "Low" }, { id: "medium", name: "Medium" },
        { id: "high", name: "High" }, { id: "xhigh", name: "Extra high" },
        { id: "max", name: "Max" },
      ];
      const [preference, setPreference] = React.useState(null);
      const preferenceKey = `royalliang-codex-effort:${sessionId}:${current?.provider}:${current?.model}`;
      let preferred = preference?.key === preferenceKey ? preference.value : "high";
      try {
        if (preference?.key !== preferenceKey) preferred = window.localStorage.getItem(preferenceKey) ?? "high";
      } catch { /* Browser storage may be unavailable; keep the in-page preference. */ }
      const fallback = efforts.some((item) => item.id === preferred) ? preferred : "high";
      const effort = reasoning ? current?.reasoningEffort ?? (efforts.some((item) => item.id === "high") ? "high" : reasoning.defaultEffort ?? efforts[0].id) : fallback;
      React.useEffect(() => {
        if (!reasoning || !available || state.status !== "ready" || !current || current.reasoningEffort !== undefined) return;
        let mounted = true;
        directory.select({ ...current, reasoningEffort: effort }).then((result) => {
          if (mounted && !result?.ok) setError("默认推理强度保存失败，请手动重试");
        }).catch(() => { if (mounted) setError("默认推理强度保存失败，请手动重试"); });
        return () => { mounted = false; };
      }, [directory, available, !!reasoning, state.status, current?.provider, current?.model, current?.reasoningEffort, effort]);
      return React.createElement("span", { className: "rcx_fast" },
        React.createElement(primitives.Menu, {
          open,
          onClose: () => setOpen(false),
          selectedId: effort,
          portal: true,
          side: "top",
          align: "end",
          dense: true,
          autoFocus: true,
          anchor: React.createElement(primitives.Button, {
            size: "sm",
            "aria-label": "推理强度",
            "aria-haspopup": "menu",
            "aria-expanded": open,
            title: reasoning ? "选择推理强度" : "当前适配器未提供推理等级支持；此处仅保存偏好，不向模型发送该参数",
            disabled: !available || !current || state.status !== "ready",
            onClick: () => setOpen(!open),
            onKeyDown: (event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                setOpen(true);
              }
            },
          }, `${icons[effort] ?? "◌"} ${efforts.find((item) => item.id === effort)?.name ?? effort}`,
          React.createElement(primitives.IconChevronDownOutlineRegular, { "aria-hidden": true })),
          items: efforts.map((item) => ({ id: item.id, label: item.name, icon: icons[item.id] ?? "◌" })),
          onSelect: async (next) => {
            if (!available || state.status !== "ready" || !current || !efforts.some((item) => item.id === next)) return;
            setOpen(false);
            setError("");
            if (!reasoning) {
              setPreference({ key: preferenceKey, value: next });
              try { window.localStorage.setItem(preferenceKey, next); }
              catch { setError("已选择偏好；浏览器无法保存，刷新后可能重置"); }
              return;
            }
            try {
              const result = await directory.select({ ...current, reasoningEffort: next });
              if (!result?.ok) setError("推理强度保存失败，请重试");
            } catch { setError("推理强度保存失败，请重试"); }
          },
        }),
        error || state.error ? React.createElement("span", { role: "alert" }, error || state.error) : null);
    }

    function ModelDisplay({ directory, available }) {
      const state = React.useSyncExternalStore(
        (notify) => directory.store.subscribe(notify),
        () => directory.store.getSnapshot(),
      );
      React.useEffect(() => { if (available) directory.load().catch(() => {}); }, [directory, available]);
      const current = state.current;
      const model = state.groups.find((group) => group.id === current?.provider)?.models.find((item) => item.id === current?.model);
      return React.createElement("div", { className: "rcx_fast", style: { padding: "4px 0" },
        title: current ? `${current.provider}/${current.model}` : undefined },
        `当前模型：${model?.name ?? current?.model ?? "加载中"}`);
    }

    const inject = ["slots"];

    function apply(ctx) {
      ctx.inject(["slots", "configForms"], (scope) => {
        let form;
        try {
          form = scope.configForms.get(ENTRY);
        } catch {
          return;
        }
        scope.slots.inject(SLOT, () => scope.slots.register({ name: SLOT, id: "royalliang-codex-fast" },
          () => React.createElement(FastToggle, { form })));
      });
      ctx.inject(["slots", "modelDirectories", "sessions"], (scope) => {
        scope.slots.inject(SLOT, () => scope.slots.register({
          name: SLOT,
          id: "royalliang-codex-reasoning",
          inject: (sessionId) => ({
            sessionId,
            directory: scope.modelDirectories.directoryFor(sessionId),
            available: scope.sessions.subagentAddress(sessionId) === undefined,
          }),
        }, ReasoningSelect));
        const dock = "conversation.composer.dock";
        scope.slots.inject(dock, () => scope.slots.register({
          name: dock,
          id: "royalliang-codex-model",
          order: 0,
          inject: (sessionId) => ({
            directory: scope.modelDirectories.directoryFor(sessionId),
            available: scope.sessions.subagentAddress(sessionId) === undefined,
          }),
        }, ModelDisplay));
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
