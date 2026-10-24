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
      tag.textContent = ".rcx_strip{align-items:center;gap:6px;display:inline-flex;white-space:nowrap}" +
        ".rcx_model{font-size:12px}.rcx_effort{font-size:12px;opacity:.65}" +
        ".rcx_fast{align-items:center;gap:4px;display:inline-flex;font-size:12px;opacity:.85}";
      document.head.appendChild(tag);
    }

    /** Model + effective reasoning level of the session, read from the host catalog. */
    function ModelStrip({ directory, load }) {
      const state = React.useSyncExternalStore(
        (notify) => directory.subscribe(notify),
        () => directory.getSnapshot(),
      );
      React.useEffect(() => { load(); }, []);
      const current = state?.current;
      if (current === null || current === undefined) return null;
      const group = (state.groups ?? []).find((candidate) => candidate.id === current.provider);
      const model = (group?.models ?? []).find((candidate) => candidate.id === current.model);
      const reasoning = model?.reasoning;
      const effort = current.reasoningEffort ?? reasoning?.defaultEffort;
      const effortName = effort === undefined
        ? undefined
        : reasoning?.efforts.find((level) => level.id === effort)?.name ?? effort;
      const name = model?.name ?? current.model;
      return React.createElement("div", { className: "rcx_strip", title: "会话模型：" + name },
        React.createElement("span", { className: "rcx_model" }, name),
        effortName === undefined ? null : React.createElement("span", { className: "rcx_effort" }, effortName));
    }

    /** Fast toggle stored in this plugin entry's config; the host reloads us on write. */
    function FastToggle({ form }) {
      const state = React.useSyncExternalStore(
        (notify) => form.subscribe(notify),
        () => form.getSnapshot(),
      );
      const fast = state?.value?.fast === true;
      const locked = state?.writable !== true;
      return React.createElement("span", { className: "rcx_fast" },
        React.createElement("span", null, "Fast"),
        React.createElement(primitives.Switch, {
          checked: fast,
          label: "Fast 模式",
          title: locked ? "插件配置当前不可写" : "开启后 Responses 请求附带 service_tier=priority",
          disabled: locked,
          onChange: (next) => { form.set("fast", next).catch(() => {}); },
        }));
    }

    const inject = ["slots"];

    function apply(ctx) {
      ctx.inject(["slots", "modelDirectories"], (scope) => {
        scope.slots.inject(SLOT, () => scope.slots.register({
          name: SLOT,
          inject: (sessionId) => {
            try {
              const directory = scope.modelDirectories.directoryFor(sessionId);
              return {
                directory: directory.store,
                load: () => { directory.load().catch(() => {}); },
              };
            } catch {
              return { directory: null, load: () => {} };
            }
          },
        }, (props) => props?.directory == null ? null : React.createElement(ModelStrip, props)));
      });
      ctx.inject(["slots", "configForms"], (scope) => {
        let form;
        try {
          form = scope.configForms.get(ENTRY);
        } catch {
          return;
        }
        scope.slots.inject(SLOT, () => scope.slots.register({ name: SLOT },
          () => React.createElement(FastToggle, { form })));
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
