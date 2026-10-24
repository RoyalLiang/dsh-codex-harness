import { jsx as _jsx, jsxs as _jsxs, Fragment as _Fragment } from "react/jsx-runtime";
import { useEffect, useRef, useState } from 'react';
import { DEFAULT_CODEX_SYSTEM_PROMPT } from "../prompt.js";
import { isPresetConnectionError, readPresetWithRetry } from "./preset-requests.js";
const catalogCache = new WeakMap();
const documentCache = new WeakMap();
const CODEX_DEFAULT_ID = 'codex-collaboration';
function unwrap(result) {
    if (result.ok)
        return result.value;
    throw new Error(result.error.message ?? 'remote-request-failed');
}
function equalEditorState(a, b) {
    if (!a || !b)
        return a === b;
    return a.name === b.name && a.description === b.description && a.systemPrompt === b.systemPrompt
        && a.inheritPrompt === b.inheritPrompt && a.codex === b.codex
        && JSON.stringify(a.codexOptions) === JSON.stringify(b.codexOptions)
        && JSON.stringify(a.promptSections) === JSON.stringify(b.promptSections);
}
const styles = `
.codex-preset-editor { display:grid; gap:12px; min-width:0; font-size:13px; }
.codex-preset-editor label { display:grid; gap:6px; }
.codex-preset-editor .pe-row { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
.codex-preset-editor input:not([type=checkbox]), .codex-preset-editor textarea, .codex-preset-editor select { box-sizing:border-box; width:100%; padding:8px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; background:var(--dsw-alias-bg-layer-3); color:inherit; font:inherit; }
.codex-preset-editor textarea { resize:vertical; line-height:1.5; }
.codex-preset-editor button { font:inherit; padding:6px 12px; border:1px solid var(--dsw-alias-border-l2); border-radius:6px; background:var(--dsw-alias-bg-layer-3); color:inherit; cursor:pointer; }
.codex-preset-editor button:disabled { opacity:.5; cursor:default; }
.codex-preset-editor .pe-primary { background:#425ce5; border-color:#425ce5; color:white; }
.codex-preset-editor .pe-block { display:grid; gap:9px; padding-top:12px; border-top:1px solid var(--dsw-alias-border-l2); }
.codex-preset-editor .pe-toggle { display:flex; align-items:flex-start; gap:9px; }
.codex-preset-editor .pe-toggle span { display:grid; gap:2px; }
.codex-preset-editor p { margin:0; font-size:12px; line-height:1.55; color:var(--dsw-alias-label-tertiary); }
`;
function optionToggle(key, label, hint, options, setOptions, disabled) {
    return _jsxs("label", { className: "pe-toggle", children: [_jsx("input", { type: "checkbox", checked: options[key], disabled: disabled, onChange: event => setOptions({ ...options, [key]: event.target.checked }) }), _jsxs("span", { children: [_jsx("strong", { children: label }), _jsx("small", { children: hint })] })] }, key);
}
/** Presets are peers: choose one to edit, or make an editable copy first. */
export function PresetManagerCard({ presetManager, t }) {
    const [catalog, setCatalog] = useState(() => catalogCache.get(presetManager));
    const [selectedId, setSelectedId] = useState('');
    const [original, setOriginal] = useState();
    const [draft, setDraft] = useState();
    const [sourceId, setSourceId] = useState('');
    const [copyMode, setCopyMode] = useState(false);
    const [codexEnabled, setCodexEnabled] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [errorAction, setErrorAction] = useState('read');
    const [notice, setNotice] = useState('');
    const alive = useRef(true);
    const request = useRef(0);
    if (!documentCache.has(presetManager))
        documentCache.set(presetManager, new Map());
    const cache = documentCache.get(presetManager);
    const remote = presetManager.remote.codexPresetEditor;
    const dirty = !!draft && (!original || !equalEditorState(draft, original) || codexEnabled !== draft.codex);
    async function run(work) {
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await presetManager.ready;
            if (alive.current)
                await work();
        }
        catch (cause) {
            if (alive.current)
                setError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            if (alive.current)
                setBusy(false);
        }
    }
    async function load(id, confirmDirty = true) {
        if (!id)
            return;
        if (confirmDirty && dirty && !window.confirm(t('pmDiscard')))
            return;
        const ticket = ++request.current;
        setSelectedId(id);
        setError('');
        setNotice('');
        setErrorAction('read');
        const accept = (value) => {
            if (!alive.current || ticket !== request.current)
                return;
            setSelectedId(id);
            setSourceId(id);
            setOriginal(value);
            setDraft(value);
            setCopyMode(false);
            setCodexEnabled(value.codex);
        };
        const cached = cache.get(id);
        if (cached && Date.now() - cached.time < 60_000) {
            accept(cached.value);
            return;
        }
        setDraft(undefined);
        setOriginal(undefined);
        setBusy(true);
        try {
            await presetManager.ready;
            const value = await readPresetWithRetry(() => remote.read(id).then(unwrap), () => alive.current && ticket === request.current);
            cache.set(id, { value, time: Date.now() });
            accept(value);
        }
        catch (cause) {
            if (alive.current && ticket === request.current)
                setError(String(cause));
        }
        finally {
            if (alive.current && ticket === request.current)
                setBusy(false);
        }
    }
    async function refresh() {
        setErrorAction('read');
        const value = await readPresetWithRetry(() => remote.catalog().then(unwrap), () => alive.current);
        if (!alive.current)
            return;
        catalogCache.set(presetManager, value);
        setCatalog(value);
        const current = selectedId || (value.presets.some(row => row.id === CODEX_DEFAULT_ID) ? CODEX_DEFAULT_ID : value.presets[0]?.id ?? '');
        if (current && current !== selectedId)
            await load(current, false);
    }
    useEffect(() => {
        alive.current = true;
        if (!catalogCache.has(presetManager))
            void run(refresh);
        else if (!selectedId)
            void load(catalogCache.get(presetManager)?.presets.some(row => row.id === CODEX_DEFAULT_ID) ? CODEX_DEFAULT_ID : catalogCache.get(presetManager)?.presets[0]?.id ?? '', false);
        return () => { alive.current = false; };
    }, [presetManager]);
    useEffect(() => {
        if (!dirty)
            return;
        const guard = (event) => { event.preventDefault(); event.returnValue = ''; };
        window.addEventListener('beforeunload', guard);
        return () => window.removeEventListener('beforeunload', guard);
    }, [dirty]);
    function patch(value) { if (draft)
        setDraft({ ...draft, ...value }); }
    function beginCopy() {
        if (!draft || !sourceId)
            return;
        setCopyMode(true);
        setCodexEnabled(draft.codex);
        setOriginal({ ...draft });
        setDraft({ ...draft, id: '', revision: '', editable: true, name: `${draft.name} · ${t('pmCustom')}` });
    }
    function save() {
        if (!draft || busy || !draft.name.trim())
            return;
        setErrorAction('save');
        void run(async () => {
            const options = codexEnabled ? draft.codexOptions : undefined;
            const payload = { name: draft.name, description: draft.description, systemPrompt: draft.systemPrompt,
                promptSections: draft.promptSections.filter(section => section.editable && (codexEnabled || section.id !== 'codex:base')),
                inheritPrompt: draft.inheritPrompt, enableCodex: codexEnabled, ...(options === undefined ? {} : { codexOptions: options }) };
            const value = unwrap(await (copyMode
                ? remote.create({ ...payload, sourceId })
                : remote.update({ ...payload, id: draft.id, revision: draft.revision })));
            if (!alive.current)
                return;
            setSelectedId(value.id);
            setSourceId(value.id);
            setOriginal(value);
            setDraft(value);
            cache.set(value.id, { value, time: Date.now() });
            setCopyMode(false);
            setCodexEnabled(value.codex);
            setNotice(t('peSaved'));
            if (catalog) {
                const row = { id: value.id, name: value.name, description: value.description, editable: value.editable,
                    isDefault: catalog.presets.find(item => item.id === value.id)?.isDefault ?? false };
                const presets = catalog.presets.some(item => item.id === value.id)
                    ? catalog.presets.map(item => item.id === value.id ? row : item) : [...catalog.presets, row];
                catalogCache.set(presetManager, { ...catalog, presets });
                setCatalog({ ...catalog, presets });
            }
        });
    }
    const selectedRow = catalog?.presets.find(row => row.id === selectedId);
    const readOnly = !!draft && !draft.editable && !copyMode;
    const options = draft?.codexOptions;
    return _jsxs("section", { className: "codex-preset-editor", "aria-label": t('peTitle'), "aria-busy": busy, children: [_jsx("style", { children: styles }), _jsxs("div", { className: "pe-row", style: { justifyContent: 'space-between' }, children: [_jsx("strong", { children: t('peTitle') }), _jsx("button", { type: "button", disabled: busy, onClick: () => { if (dirty && !window.confirm(t('pmDiscard')))
                            return; cache.clear(); void run(async () => { await refresh(); if (selectedId)
                            await load(selectedId, false); }); }, children: t('pmRefresh') })] }), _jsx("p", { children: t(catalog?.authorable === false ? 'peProfileReadOnly' : 'peHierarchy') }), _jsxs("label", { children: [t('peSelect'), _jsxs("select", { value: selectedId, disabled: busy || !catalog, onChange: event => { void load(event.target.value); }, children: [_jsx("option", { value: "", children: t('peSelectPlaceholder') }), catalog?.presets.map(row => _jsxs("option", { value: row.id, children: [row.name, row.editable ? '' : ` · ${t(catalog.authorable ? 'pmBuiltIn' : 'pmReadOnly')}`] }, row.id))] })] }), selectedRow && catalog?.authorable && _jsx("p", { children: selectedRow.editable ? t('peEditable') : t('peBuiltinEdit') }), error && _jsxs("div", { role: "alert", children: [_jsx("p", { children: errorAction === 'read'
                            ? t(isPresetConnectionError(error) ? 'peConnectionError' : 'peReadError')
                            : error.includes('preset-conflict') ? t('pmConflict') : error.includes('invalid-preset-yaml') ? t('pmYamlError') : t('pmSaveError') }), errorAction === 'read' && _jsxs("div", { className: "pe-row", children: [_jsx("button", { type: "button", disabled: busy, onClick: () => { if (selectedId) {
                                    cache.delete(selectedId);
                                    void load(selectedId, false);
                                }
                                else
                                    void run(refresh); }, children: t('peRetryRead') }), !draft && isPresetConnectionError(error) && _jsx("button", { type: "button", onClick: () => window.location.reload(), children: t('peReconnect') })] }), _jsxs("details", { children: [_jsx("summary", { children: t('pmErrorDetails') }), _jsx("pre", { style: { whiteSpace: 'pre-wrap' }, children: error })] })] }), notice && _jsx("p", { role: "status", children: notice }), busy && !draft && _jsx("p", { role: "status", children: t('peLoading') }), draft && _jsxs(_Fragment, { children: [_jsxs("label", { children: [t('pmName'), _jsx("input", { value: draft.name, maxLength: 200, disabled: busy || readOnly, onChange: event => patch({ name: event.target.value }) })] }), _jsxs("label", { children: [t('pmDescription'), _jsx("input", { value: draft.description, maxLength: 4000, disabled: busy || readOnly, onChange: event => patch({ description: event.target.value }) })] }), !copyMode && catalog?.authorable && _jsx("button", { type: "button", disabled: busy, onClick: beginCopy, children: t('peCreateCopy') }), _jsxs("div", { className: "pe-block", children: [_jsx("strong", { children: t('peSystemPrompt') }), _jsx("p", { children: t('peSectionsHint') }), draft.promptSections.map(section => _jsxs("details", { children: [_jsxs("summary", { style: { cursor: 'pointer', padding: '6px 0' }, children: [section.label, section.suppressed ? ` · ${t('peSuppressed')}` : ''] }), section.id === 'harness:source' && _jsx("p", { children: t('peDshSourcePrompt') }), section.id === 'app:web-surface' && _jsx("p", { children: t('peDshWebPrompt') }), _jsx("textarea", { "aria-label": section.label, rows: section.id === 'codex:base' ? 12 : 5, value: section.text, disabled: busy || readOnly || !section.editable, onChange: event => patch({ promptSections: draft.promptSections.map(item => item.id === section.id ? { ...item, text: event.target.value } : item),
                                            ...(section.id === 'codex:base' ? { systemPrompt: event.target.value, inheritPrompt: false } : {}) }) }), section.suppressed ? _jsx("p", { children: t('peCompletePersona') }) : !readOnly && !section.editable && _jsx("p", { children: t('peDynamicPrompt') })] }, section.id))] }), !readOnly && _jsxs(_Fragment, { children: [_jsxs("div", { className: "pe-block", children: [_jsx("strong", { children: t('peCodexSection') }), !draft.codex && _jsxs("label", { className: "pe-toggle", children: [_jsx("input", { type: "checkbox", checked: codexEnabled, disabled: busy, onChange: event => {
                                                    const enabled = event.target.checked;
                                                    setCodexEnabled(enabled);
                                                    if (enabled) {
                                                        const extras = [
                                                            { id: 'codex:base', label: 'Codex 操作提示词', text: DEFAULT_CODEX_SYSTEM_PROMPT, editable: true },
                                                        ];
                                                        patch({ promptSections: [...draft.promptSections.map(s => s.suppressed ? { ...s, suppressed: undefined, editable: true } : s), ...extras.filter(item => !draft.promptSections.some(s => s.id === item.id))] });
                                                    }
                                                    else
                                                        patch({ promptSections: draft.promptSections.filter(s => original?.promptSections.some(item => item.id === s.id)).map(s => {
                                                                const source = original?.promptSections.find(item => item.id === s.id);
                                                                return source?.suppressed ? { ...s, suppressed: true, editable: false } : s;
                                                            }) });
                                                } }), _jsxs("span", { children: [_jsx("strong", { children: t('peAddCodex') }), _jsx("small", { children: t('peAddCodexHint') })] })] }), codexEnabled && options && _jsxs(_Fragment, { children: [optionToggle('hostedWebSearchEnabled', t('capabilityWebSearch'), t('capabilityWebSearchHint'), options, next => patch({ codexOptions: next }), busy), optionToggle('remoteCompactionEnabled', t('capabilityCompaction'), t('capabilityCompactionHint'), options, next => patch({ codexOptions: next }), busy), optionToggle('terminalToolsEnabled', t('capabilityTerminal'), t('capabilityTerminalHint'), options, next => patch({ codexOptions: next }), busy), optionToggle('patchToolEnabled', t('capabilityPatch'), t('capabilityPatchHint'), options, next => patch({ codexOptions: next }), busy), optionToggle('planToolEnabled', t('capabilityPlan'), t('capabilityPlanHint'), options, next => patch({ codexOptions: next }), busy), optionToggle('promptEnabled', t('capabilityPrompt'), t('capabilityPromptHint'), options, next => patch({ codexOptions: next }), busy), _jsx("p", { children: t('peActivityGlobal') })] })] }), _jsxs("div", { className: "pe-row", children: [_jsx("button", { type: "button", className: "pe-primary", disabled: busy || !catalog?.authorable || !draft.name.trim() || !dirty, onClick: save, children: copyMode ? t('peSaveCopy') : t('pmSave') }), copyMode && _jsx("button", { type: "button", disabled: busy, onClick: () => { void load(sourceId, false); }, children: t('pmCancel') }), !copyMode && _jsx("button", { type: "button", disabled: busy, onClick: () => { void load(draft.id, false); }, children: t('pmCancel') })] })] })] })] });
}
export default PresetManagerCard;
//# sourceMappingURL=preset-manager.js.map