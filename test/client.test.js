// Loads the browser bundle with the Host's slot, form and directory contracts.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';

const source = readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8');

function boot({ formAvailable = true, addressed = false } = {}) {
  const styles = [];
  const registrations = [];
  let loaded;
  const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });
  const require = (id) => {
    if (id === 'react') return {
      createElement,
      useSyncExternalStore: (_subscribe, getSnapshot) => getSnapshot(),
      useEffect: (effect) => effect(),
      useState: (value) => [value, (next) => { errors.push(next); }],
    };
    if (id === '@deepseek-ai/dsh-client-ui-primitives') return Object.fromEntries(
      ['Switch', 'Menu', 'Button', 'IconChevronDownOutlineRegular'].map((name) => [name, name]),
    );
    throw new Error(`unexpected module ${id}`);
  };
  const storage = new Map();
  globalThis.window = { localStorage: { getItem: (key) => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) }, __ModuleLoader__: { load: (entry) => { loaded = entry; } } };
  globalThis.document = {
    querySelector: () => null,
    createElement: () => ({ dataset: {}, textContent: '' }),
    head: { appendChild: (tag) => styles.push(tag) },
  };
  new Function(source)();
  const exports = loaded.factory(require);
  const errors = [];
  const form = {
    state: { status: 'ready', value: { fast: false }, writable: true },
    getSnapshot: () => form.state,
    subscribe() { return () => {}; },
    set(field, value) { form.last = [field, value]; return Promise.resolve(true); },
  };
  const directory = {
    state: {
      status: 'ready', current: { provider: 'p', model: 'gpt-6', reasoningEffort: 'high' },
      groups: [{ id: 'p', models: [{ id: 'gpt-6', reasoning: { defaultEffort: 'low', efforts: [{ id: 'low', name: 'Low' }, { id: 'high', name: 'High' }] } }] }],
    },
    store: { subscribe() { return () => {}; }, getSnapshot: () => directory.state },
    load: async () => { directory.loaded = true; },
    select: async (value) => { directory.last = value; return { ok: true }; },
  };
  const injected = [];
  const scope = {
    slots: {
      inject: (name, load) => { assert.ok(['conversation.input.right', 'conversation.composer.dock'].includes(name)); load(); },
      register: (options, component) => {
        assert.equal(typeof options.id, 'string', 'list slots require an id');
        assert.ok(!registrations.some((row) => row.options.id === options.id));
        registrations.push({ options, component }); return {};
      },
    },
    configForms: { get: (id) => {
      assert.equal(id, 'royalliang-codex-harness');
      if (!formAvailable) throw new Error('unavailable');
      return form;
    } },
    modelDirectories: { directoryFor: (id) => { assert.equal(id, 's1'); return directory; } },
    sessions: {
      subagentAddress: () => addressed ? {} : undefined,
      binding: () => ({ eventSource: { getSnapshot: () => ({ entries: [] }), subscribe() {} } }),
      scope: () => ({ get: (name) => { assert.equal(name, 'conversation'); return { loadOlder() {} }; } }),
    },
  };
  const ctx = { inject(deps, callback) { injected.push(deps); callback(scope); } };
  exports.apply(ctx);
  const renderFast = () => registrations.find((row) => !row.options.inject).component().type({ form });
  const renderReasoning = () => {
    const row = registrations.find((item) => item.options.id === 'royalliang-codex-reasoning');
    return row.component(row.options.inject('s1'));
  };
  const renderModel = () => {
    const row = registrations.find((item) => item.options.id === 'royalliang-codex-model');
    assert.equal(row.options.name, 'conversation.composer.dock');
    return row.component(row.options.inject('s1'));
  };
  return { exports, form, directory, registrations, injected, styles, loaded, errors, renderFast, renderReasoning, renderModel };
}

test('client registers Fast and session reasoning controls independently', () => {
  const { exports, registrations, injected, styles, loaded } = boot();
  assert.equal(loaded.id, '@royalliang/dsh-codex-harness');
  assert.deepEqual(exports.inject, ['slots']);
  assert.equal(styles.length, 1);
  assert.deepEqual(injected, [['slots', 'configForms'], ['slots', 'modelDirectories', 'sessions']]);
  assert.equal(registrations.length, 3);
});

test('Fast reflects live configuration and writes the fast field', async () => {
  const { form, renderFast, errors } = boot();
  let control = renderFast().props.children[1];
  assert.equal(control.props.checked, false);
  assert.equal(control.props.disabled, false);
  await control.props.onChange(true);
  assert.deepEqual(form.last, ['fast', true]);
  form.state = { status: 'ready', value: { fast: true }, writable: true };
  assert.equal(renderFast().props.children[1].props.checked, true);
  form.state.status = 'unavailable';
  assert.equal(renderFast().props.children[1].props.disabled, true);
  form.set = async () => false;
  await control.props.onChange(true);
  assert.equal(errors.at(-1), 'Fast 保存失败，请重试');
});

test('reasoning uses the host menu with advertised icons and current session selection', async () => {
  const { directory, renderReasoning } = boot();
  const menu = renderReasoning().props.children[0];
  assert.equal(directory.loaded, true);
  assert.equal(menu.type, 'Menu');
  assert.equal(menu.props.anchor.type, 'Button');
  assert.equal(menu.props.selectedId, 'high');
  assert.equal(menu.props.anchor.props.disabled, false);
  assert.deepEqual(menu.props.items, [
    { id: 'low', label: 'Low', icon: '◔' }, { id: 'high', label: 'High', icon: '◕' },
  ]);
  await menu.props.onSelect('low');
  assert.deepEqual(directory.last, { provider: 'p', model: 'gpt-6', reasoningEffort: 'low' });
  directory.last = undefined;
  await menu.props.onSelect('max');
  assert.equal(directory.last, undefined, 'unadvertised Max must not reach the provider');
  directory.state.groups[0].models[0].reasoning.efforts.push({ id: 'max', name: 'Max' });
  await renderReasoning().props.children[0].props.onSelect('max');
  assert.deepEqual(directory.last, { provider: 'p', model: 'gpt-6', reasoningEffort: 'max' });
});

test('missing metadata keeps preferences including Max local and defaults high', async () => {
  const { directory, renderReasoning } = boot();
  directory.state.groups[0].models[0].reasoning = undefined;
  delete directory.state.current.reasoningEffort;
  const view = renderReasoning();
  const menu = view.props.children[0];
  assert.equal(menu.props.anchor.props.disabled, false);
  assert.equal(menu.props.selectedId, 'high');
  assert.deepEqual(menu.props.items.map((item) => item.id), ['low', 'medium', 'high', 'xhigh', 'max']);
  assert.equal(directory.last, undefined);
  assert.match(menu.props.anchor.props.title, /仅保存偏好/);
  assert.ok(!view.props.children.includes('推理等级'));
  await menu.props.onSelect('max');
  assert.equal(renderReasoning().props.children[0].props.selectedId, 'max');
  assert.equal(directory.last, undefined);
  directory.state.current.model = 'other';
  assert.equal(renderReasoning().props.children[0].props.selectedId, 'high');
  window.localStorage.setItem('royalliang-codex-effort:s1:p:other', 'invented');
  assert.equal(renderReasoning().props.children[0].props.selectedId, 'high');
  const subagent = boot({ addressed: true });
  assert.equal(subagent.renderReasoning().props.children[0].props.anchor.props.disabled, true);
  assert.equal(subagent.directory.loaded, undefined);
});

test('default high is saved instead of an advertised lower default; failures remain visible', async () => {
  const { directory, renderReasoning, errors } = boot();
  delete directory.state.current.reasoningEffort;
  directory.select = async () => ({ ok: false });
  assert.equal(renderReasoning().props.children[0].props.selectedId, 'high');
  await Promise.resolve();
  assert.equal(errors.at(-1), '默认推理强度保存失败，请手动重试');
  directory.state.status = 'loading';
  assert.equal(renderReasoning().props.children[0].props.anchor.props.disabled, true);
});

test('reasoning failures are reported and missing forms do not suppress reasoning', async () => {
  const { directory, renderReasoning, errors, registrations } = boot({ formAvailable: false });
  assert.equal(registrations.length, 2);
  directory.select = async () => ({ ok: false });
  await renderReasoning().props.children[0].props.onSelect('low');
  assert.equal(errors.at(-1), '推理强度保存失败，请重试');
});

test('model display follows the current session selection in the dock', () => {
  const { directory, renderModel } = boot();
  assert.equal(renderModel().props.children[0], '当前模型：gpt-6');
  directory.state.current = { provider: 'p', model: 'other' };
  assert.equal(renderModel().props.children[0], '当前模型：other');
});

test('composer dock contains only the model display, without duplicate history', () => {
  const { registrations } = boot();
  assert.deepEqual(registrations.filter((row) => row.options.name === 'conversation.composer.dock').map((row) => row.options.id), ['royalliang-codex-model']);
});
