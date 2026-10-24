import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/**
 * DSH Client: Reasoning Effort & Fast Mode Dropdown Popup Menu
 *
 * Provides a dropdown popup menu in the DSH conversation input area,
 * allowing users to switch reasoning effort (Low, Med, High, X-High, Max),
 * toggle Fast mode, and view current configuration.
 */
import { useEffect, useId, useRef, useState } from 'react';
const EFFORT_OPTIONS = [
    { key: 'default', label: 'Default', descKey: 'effortDefaultDesc', defaultDesc: '继承会话或提供方默认设置' },
    { key: 'low', label: 'Low', descKey: 'effortLowDesc', defaultDesc: '轻量思考 · 快速简单修改' },
    { key: 'medium', label: 'Medium', descKey: 'effortMedDesc', defaultDesc: '平衡思考 · 常规功能与重构 (推荐)' },
    { key: 'high', label: 'High', descKey: 'effortHighDesc', defaultDesc: '深度思考 · 复杂逻辑与架构分析' },
    { key: 'xhigh', label: 'X-High', descKey: 'effortXHighDesc', defaultDesc: '超强推理 · 疑难 Bug 与系统重构' },
    { key: 'max', label: 'Max', descKey: 'effortMaxDesc', defaultDesc: '极限思考 · 形式化验证与复杂证明' },
];
export function ReasoningDropdown({ useSettings, setSetting, t, capabilityNotice }) {
    const snapshot = useSettings(state => state);
    const settings = snapshot.value;
    const writable = snapshot.writable === true;
    const [open, setOpen] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const rootRef = useRef(null);
    const triggerRef = useRef(null);
    const dialogRef = useRef(null);
    const pending = useRef(false);
    const dialogId = useId();
    const fast = settings?.fast ?? false;
    const effort = settings?.reasoningEffort ?? 'default';
    const showFast = settings?.fastModeControlEnabled ?? true;
    const showEffort = settings?.reasoningEffortControlEnabled ?? true;
    const disabled = !writable || saving;
    function close() {
        setOpen(false);
        triggerRef.current?.focus();
    }
    async function save(field, value) {
        if (!writable || pending.current)
            return;
        pending.current = true;
        setSaving(true);
        setError('');
        try {
            await setSetting(field, value);
            if (field === 'reasoningEffort')
                close();
        }
        catch (cause) {
            setError(cause instanceof Error ? cause.message : String(cause));
        }
        finally {
            pending.current = false;
            setSaving(false);
        }
    }
    useEffect(() => {
        if (!open)
            return undefined;
        dialogRef.current?.focus();
        const onPointerDown = (event) => {
            if (event.target instanceof Node && rootRef.current?.contains(event.target) === true)
                return;
            setOpen(false);
        };
        const onKeyDown = (event) => {
            if (event.key === 'Escape') {
                event.preventDefault();
                close();
            }
        };
        document.addEventListener('pointerdown', onPointerDown);
        document.addEventListener('keydown', onKeyDown);
        return () => {
            document.removeEventListener('pointerdown', onPointerDown);
            document.removeEventListener('keydown', onKeyDown);
        };
    }, [open]);
    if (!showFast && !showEffort)
        return null;
    const currentOption = EFFORT_OPTIONS.find(opt => opt.key === effort) ?? EFFORT_OPTIONS[0];
    return (_jsxs("span", { ref: rootRef, style: { position: 'relative', display: 'inline-flex', alignItems: 'center' }, children: [_jsxs("button", { ref: triggerRef, type: "button", "aria-haspopup": "dialog", "aria-controls": open ? dialogId : undefined, "aria-expanded": open, disabled: !writable, title: t('reasoningMenuTitle') || 'Codex 思考与模式设置', onClick: () => { setError(''); setOpen(prev => !prev); }, style: {
                    boxSizing: 'border-box',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 28,
                    border: '1px solid var(--dsw-alias-border-primary, rgba(128,128,128,0.2))',
                    borderRadius: 7,
                    padding: '0 8px',
                    color: showFast && fast ? 'var(--dsw-static-blue-500)' : 'var(--dsw-alias-label-primary)',
                    background: open ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
                    cursor: writable ? 'pointer' : 'default',
                    font: 'inherit',
                    fontSize: 12,
                    lineHeight: '20px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                }, children: [_jsx("span", { children: showFast && fast ? '⚡ Fast' : showEffort ? '🧠' : t('fast') }), showEffort && _jsx("span", { children: effort === 'default' ? t('effortDefaultLabel') || 'Default' : currentOption.label }), _jsx("svg", { viewBox: "0 0 12 12", width: "10", height: "10", "aria-hidden": true, style: {
                            transform: open ? 'rotate(180deg)' : 'none',
                            transition: 'transform 0.15s ease',
                            color: 'var(--dsw-alias-label-tertiary)',
                        }, children: _jsx("path", { d: "M3 4.5 6 7.5 9 4.5", fill: "none", stroke: "currentColor", strokeWidth: "1.25", strokeLinecap: "round", strokeLinejoin: "round" }) })] }), open && (_jsxs("div", { id: dialogId, ref: dialogRef, tabIndex: -1, "aria-busy": saving, onBlur: event => {
                    if (event.relatedTarget instanceof Node && !rootRef.current?.contains(event.relatedTarget))
                        setOpen(false);
                }, role: "dialog", "aria-label": t('reasoningMenuTitle') || 'Codex 思考与模式设置', style: {
                    position: 'absolute',
                    right: 0,
                    bottom: 'calc(100% + 8px)',
                    zIndex: 30,
                    boxSizing: 'border-box',
                    width: 270,
                    maxWidth: 'calc(100vw - 24px)',
                    padding: '10px 12px',
                    border: '1px solid var(--dsw-alias-border-l2)',
                    borderRadius: 10,
                    color: 'var(--dsw-alias-label-primary)',
                    background: 'var(--dsw-alias-bg-base)',
                    boxShadow: 'var(--dsw-shadow-lv2)',
                    display: 'grid',
                    gap: 10,
                }, children: [showFast && _jsxs("label", { style: {
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            cursor: writable ? 'pointer' : 'default',
                            userSelect: 'none',
                            padding: '2px 0',
                        }, children: [_jsxs("div", { style: { display: 'grid' }, children: [_jsxs("span", { style: { fontSize: 13, fontWeight: 600, display: 'inline-flex', alignItems: 'center', gap: 4 }, children: [_jsx("span", { children: "\u26A1" }), " ", t('fast') || 'Fast 模式'] }), _jsx("span", { style: { fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }, children: t('fastDesc') || '提供方支持时请求优先服务。' })] }), _jsx("input", { type: "checkbox", role: "switch", checked: fast, disabled: disabled, onChange: event => { void save('fast', event.target.checked); }, style: { accentColor: 'var(--dsw-static-blue-500)', cursor: 'pointer' } })] }), showFast && showEffort && _jsx("div", { style: { height: 1, background: 'var(--dsw-alias-border-l2)', margin: '0 -4px' } }), showEffort && _jsxs("div", { style: { display: 'grid', gap: 4 }, children: [_jsx("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between' }, children: _jsx("span", { style: { fontSize: 11, fontWeight: 600, color: 'var(--dsw-alias-label-tertiary)', textTransform: 'uppercase' }, children: t('reasoningEffortLabel') || '思考强度 (Reasoning Effort)' }) }), _jsx("div", { style: { display: 'grid', gap: 2 }, children: EFFORT_OPTIONS.map(opt => {
                                    const isSelected = effort === opt.key;
                                    return (_jsxs("button", { type: "button", "aria-pressed": isSelected, onClick: () => { void save('reasoningEffort', opt.key); }, disabled: disabled, style: {
                                            display: 'grid',
                                            textAlign: 'left',
                                            padding: '6px 8px',
                                            borderRadius: 6,
                                            border: 0,
                                            background: isSelected ? 'var(--dsw-alias-interactive-bg-selected)' : 'transparent',
                                            color: isSelected ? 'var(--dsw-static-blue-500)' : 'var(--dsw-alias-label-primary)',
                                            cursor: writable ? 'pointer' : 'default',
                                            font: 'inherit',
                                            userSelect: 'none',
                                            transition: 'background 0.12s ease',
                                        }, children: [_jsxs("div", { style: { display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12, fontWeight: isSelected ? 600 : 500 }, children: [_jsx("span", { children: opt.key === 'default' ? t('effortDefaultLabel') || opt.label : opt.label }), isSelected && (_jsx("svg", { viewBox: "0 0 12 12", width: "12", height: "12", fill: "currentColor", children: _jsx("path", { d: "M10 3 4.5 8.5 2 6l.7-.7 1.8 1.8 4.8-4.8z" }) }))] }), _jsx("span", { style: { fontSize: 11, color: isSelected ? 'var(--dsw-static-blue-500)' : 'var(--dsw-alias-label-tertiary)', lineHeight: 1.3, opacity: isSelected ? 0.85 : 1 }, children: t(opt.descKey) || opt.defaultDesc })] }, opt.key));
                                }) })] }), capabilityNotice && _jsx("p", { role: "status", style: { margin: 0, fontSize: 11, color: 'var(--dsw-alias-label-tertiary)' }, children: capabilityNotice }), error && _jsxs("div", { role: "alert", style: { fontSize: 12 }, children: [_jsx("span", { children: t('reasoningSaveFailed') || '无法保存设置，请重试。' }), _jsx("div", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: error })] })] }))] }));
}
//# sourceMappingURL=reasoning-dropdown.js.map