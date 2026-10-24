// Loads lib/client.js the way the browser shell does and drives apply() with stub services.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

function boot() {
  const styles = [];
  const registrations = [];
  let loaded;
  const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
  const require = (id) => {
    if (id === 'react') {
      return {
        createElement,
        useEffect() {},
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
  const directory = {
    subscribe() { return () => {}; },
    getSnapshot: () => ({
      current: { provider: 'nnn', model: 'gpt-6.1-sol', reasoningEffort: 'high' },
      groups: [{
        id: 'nnn',
        name: 'nnn',
        models: [{
          id: 'gpt-6.1-sol',
          name: 'GPT-6.1 Sol',
          reasoning: { efforts: [{ id: 'high', name: 'High' }] },
        }],
      }],
    }),
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
        configForms: { get: (id) => { assert.equal(id, 'royalliang-codex-harness'); return form; } },
        modelDirectories: {
          directoryFor: (sessionId) => {
            assert.equal(sessionId, 'session-1');
            return { store: directory, load: async () => {} };
          },
        },
      });
    },
  };
  return { exports, ctx, form, registrations, injected, styles, loaded };
}

test('client bundle registers a model strip and a fast toggle in the input bar', () => {
  const { exports, ctx, registrations, injected, styles, loaded } = boot();
  assert.equal(loaded.id, '@royalliang/dsh-codex-harness');
  assert.deepEqual(exports.inject, ['slots']);
  assert.equal(typeof exports.apply, 'function');
  assert.equal(styles.length, 1);

  exports.apply(ctx);
  assert.deepEqual(injected, [['slots', 'modelDirectories'], ['slots', 'configForms']]);
  assert.equal(registrations.length, 2);
  for (const { options } of registrations) assert.equal(options.name, 'conversation.input.right');

  const props = registrations[0].options.inject('session-1');
  const strip = registrations[0].component(props);
  const rendered = strip.type(props);
  assert.equal(rendered.props.className, 'rcx_strip');
  assert.equal(String(rendered.props.children[0].props.children), 'GPT-6.1 Sol');
  assert.equal(String(rendered.props.children[1].props.children), 'High');
});

test('fast toggle reflects config and writes the fast field', () => {
  const { exports, ctx, form, registrations } = boot();
  exports.apply(ctx);
  const toggleNode = registrations[1].component().type({ form });
  assert.equal(toggleNode.props.className, 'rcx_fast');
  const switchNode = toggleNode.props.children[1];
  assert.equal(typeof switchNode.type, 'function');
  assert.equal(switchNode.props.checked, false);
  assert.equal(switchNode.props.disabled, false);
  switchNode.props.onChange(true);
  assert.deepEqual(form.last, ['fast', true]);
});
