// Loads lib/client.js the way the browser shell does and drives apply() with stub services.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

function boot({ formAvailable = true } = {}) {
  const styles = [];
  const registrations = [];
  let loaded;
  const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
  const require = (id) => {
    if (id === 'react') {
      return {
        createElement,
        useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
      };
    }
    if (id === '@deepseek-ai/dsh-client-ui-primitives') {
      return { Switch: (props) => createElement('switch', props) };
    }
    throw new Error(`unexpected module ${id}`);
  };
  globalThis.window = { __ModuleLoader__: { load: (entry) => { loaded = entry; } } };
  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: (tag) => styles.push(tag) },
  };
  new Function(source)();
  const exports = loaded.factory(require);

  const form = {
    last: undefined,
    getSnapshot: () => ({ value: { fast: false }, writable: true }),
    subscribe() { return () => {}; },
    set(field, value) { form.last = [field, value]; return Promise.resolve(); },
  };
  const injected = [];
  const ctx = {
    inject(deps, callback) {
      injected.push(deps);
      callback({
        slots: {
          inject: (name, load) => { assert.equal(name, 'conversation.input.right'); load(); },
          register: (options, component) => { registrations.push({ options, component }); return {}; },
        },
        configForms: {
          get: (id) => {
            assert.equal(id, 'royalliang-codex-harness');
            if (!formAvailable) throw new Error('unavailable');
            return form;
          },
        },
      });
    },
  };
  return { exports, ctx, form, registrations, injected, styles, loaded };
}

test('client bundle registers one Fast toggle in the input bar', () => {
  const { exports, ctx, registrations, injected, styles, loaded } = boot();
  assert.equal(loaded.id, '@royalliang/dsh-codex-harness');
  assert.deepEqual(exports.inject, ['slots']);
  assert.equal(typeof exports.apply, 'function');
  assert.equal(styles.length, 1);

  exports.apply(ctx);
  assert.deepEqual(injected, [['slots', 'configForms']]);
  assert.equal(registrations.length, 1);
  assert.equal(registrations[0].options.name, 'conversation.input.right');
});

test('fast toggle reflects config and writes the fast field', () => {
  const { exports, ctx, form, registrations } = boot();
  exports.apply(ctx);
  const toggleNode = registrations[0].component().type({ form });
  assert.equal(toggleNode.props.className, 'rcx_fast');
  const switchNode = toggleNode.props.children[1];
  assert.equal(typeof switchNode.type, 'function');
  assert.equal(switchNode.props.checked, false);
  assert.equal(switchNode.props.disabled, false);
  switchNode.props.onChange(true);
  assert.deepEqual(form.last, ['fast', true]);
});

test('client bundle stays silent when the config form service is unavailable', () => {
  const { exports, ctx, registrations } = boot({ formAvailable: false });
  assert.doesNotThrow(() => exports.apply(ctx));
  assert.equal(registrations.length, 0);
});
