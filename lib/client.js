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
      tag.textContent = ".rcx_fast{align-items:center;gap:4px;display:inline-flex;font-size:12px;opacity:.85}";
      document.head.appendChild(tag);
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
          title: locked ? "插件配置当前不可写" : "开启后 gpt-* 模型的 Responses 请求附带 service_tier=priority",
          disabled: locked,
          onChange: (next) => { form.set("fast", next).catch(() => {}); },
        }));
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
        scope.slots.inject(SLOT, () => scope.slots.register({ name: SLOT },
          () => React.createElement(FastToggle, { form })));
      });
    }

    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  },
});
