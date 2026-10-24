import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
/** Independent Fast switch and reasoning effort menu for the composer. */
import { useEffect, useId, useRef, useState } from 'react';
const EFFORT_OPTIONS = [
    { key: 'default', label: 'Default' },
    { key: 'low', label: 'Low' },
    { key: 'medium', label: 'Medium' },
    { key: 'high', label: 'High' },
    { key: 'xhigh', label: 'X-High' },
    { key: 'max', label: 'Max' },
];
export function ReasoningDropdown({ useSettings, setSetting, t }) {
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
        if (!open || !showEffort)
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
    }, [open, showEffort]);
    if (!showFast && !showEffort)
        return null;
    const currentOption = EFFORT_OPTIONS.find(opt => opt.key === effort) ?? EFFORT_OPTIONS[0];
    return (_jsxs("span", { ref: rootRef, style: { position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 8 }, children: [showFast && _jsxs("button", { type: "button", role: "switch", "aria-checked": fast, "aria-label": t('fast') || 'Fast', title: fast ? t('fastOn') : t('fastOff'), disabled: disabled, onClick: () => { void save('fast', !fast); }, style: {
                    display: 'inline-flex', alignItems: 'center', gap: 6, height: 28,
                    border: 0, padding: '0 4px', background: 'transparent',
                    color: 'var(--dsw-alias-label-secondary)', font: 'inherit', fontSize: 12,
                    cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1,
                }, children: [_jsx("span", { children: t('fast') || 'Fast' }), _jsx("span", { "aria-hidden": "true", style: {
                            display: 'inline-flex', alignItems: 'center', width: 28, height: 16,
                            boxSizing: 'border-box', padding: 2, borderRadius: 8,
                            background: fast ? 'var(--dsw-static-blue-500)' : 'var(--dsw-alias-label-tertiary)',
                            transition: 'background 0.15s ease',
                        }, children: _jsx("span", { style: {
                                width: 12, height: 12, borderRadius: '50%', background: 'white',
                                transform: fast ? 'translateX(12px)' : 'translateX(0)', transition: 'transform 0.15s ease',
                            } }) })] }), showEffort && _jsxs("button", { ref: triggerRef, type: "button", "aria-haspopup": "dialog", "aria-controls": open ? dialogId : undefined, "aria-expanded": open, disabled: disabled, title: t('reasoningMenuTitle') || 'Reasoning Effort', onClick: () => { setError(''); setOpen(prev => !prev); }, style: {
                    boxSizing: 'border-box',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    height: 28,
                    border: '1px solid var(--dsw-alias-border-primary, rgba(128,128,128,0.2))',
                    borderRadius: 7,
                    padding: '0 8px',
                    color: 'var(--dsw-alias-label-primary)',
                    background: open ? 'var(--dsw-alias-interactive-bg-hover)' : 'transparent',
                    cursor: disabled ? 'default' : 'pointer',
                    font: 'inherit',
                    fontSize: 12,
                    lineHeight: '20px',
                    fontWeight: 500,
                    whiteSpace: 'nowrap',
                    userSelect: 'none',
                }, children: [_jsx("span", { "aria-hidden": "true", children: "\uD83E\uDDE0" }), _jsx("span", { children: effort === 'default' ? t('effortDefaultLabel') || 'Default' : currentOption.label }), _jsx("svg", { viewBox: "0 0 12 12", width: "10", height: "10", "aria-hidden": "true", style: {
                            transform: open ? 'rotate(180deg)' : 'none', transition: 'transform 0.15s ease',
                            color: 'var(--dsw-alias-label-tertiary)',
                        }, children: _jsx("path", { d: "M3 4.5 6 7.5 9 4.5", fill: "none", stroke: "currentColor", strokeWidth: "1.25", strokeLinecap: "round", strokeLinejoin: "round" }) })] }), open && showEffort && _jsx("div", { id: dialogId, ref: dialogRef, tabIndex: -1, "aria-busy": saving, onBlur: event => {
                    if (event.relatedTarget instanceof Node && !rootRef.current?.contains(event.relatedTarget))
                        setOpen(false);
                }, role: "dialog", "aria-label": t('reasoningMenuTitle') || 'Reasoning Effort', style: {
                    position: 'absolute', right: 0, bottom: 'calc(100% + 8px)', zIndex: 30,
                    boxSizing: 'border-box', width: 160, maxWidth: 'calc(100vw - 24px)',
                    padding: 6, border: '1px solid var(--dsw-alias-border-l2)', borderRadius: 10,
                    color: 'var(--dsw-alias-label-primary)', background: 'var(--dsw-alias-bg-base)',
                    boxShadow: 'var(--dsw-shadow-lv2)', display: 'grid', gap: 2,
                }, children: EFFORT_OPTIONS.map(opt => {
                    const isSelected = effort === opt.key;
                    return _jsxs("button", { type: "button", "aria-pressed": isSelected, onClick: () => { void save('reasoningEffort', opt.key); }, disabled: disabled, style: {
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 0,
                            background: isSelected ? 'var(--dsw-alias-interactive-bg-selected)' : 'transparent',
                            color: isSelected ? 'var(--dsw-static-blue-500)' : 'var(--dsw-alias-label-primary)',
                            cursor: disabled ? 'default' : 'pointer', font: 'inherit', fontSize: 12,
                            fontWeight: isSelected ? 600 : 500, userSelect: 'none', transition: 'background 0.12s ease',
                        }, children: [_jsx("span", { children: opt.key === 'default' ? t('effortDefaultLabel') || opt.label : opt.label }), isSelected && _jsx("svg", { viewBox: "0 0 12 12", width: "12", height: "12", fill: "currentColor", "aria-hidden": "true", children: _jsx("path", { d: "M10 3 4.5 8.5 2 6l.7-.7 1.8 1.8 4.8-4.8z" }) })] }, opt.key);
                }) }), error && _jsxs("div", { role: "alert", style: {
                    position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 30,
                    padding: 8, width: 230, maxWidth: 'calc(100vw - 24px)', borderRadius: 6,
                    background: 'var(--dsw-alias-bg-base)', boxShadow: 'var(--dsw-shadow-lv2)', fontSize: 12,
                }, children: [_jsx("span", { children: t('reasoningSaveFailed') || '无法保存设置，请重试。' }), _jsx("div", { style: { whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }, children: error })] })] }));
}
//# sourceMappingURL=reasoning-dropdown.js.map