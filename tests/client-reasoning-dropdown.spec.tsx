import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { CodexSettings } from '../src/settings.ts'

// Exercise the component handlers without adding a DOM dependency.
const hooks = vi.hoisted(() => ({ slots: [] as any[], cursor: 0, effects: [] as (() => void | (() => void))[], cleanups: [] as (() => void)[] }))
vi.mock('react', async importOriginal => ({
  ...await importOriginal<typeof import('react')>(),
  useId: () => 'reasoning-dialog',
  useState: (initial: unknown) => {
    const index = hooks.cursor++
    if (!(index in hooks.slots)) hooks.slots[index] = initial
    return [hooks.slots[index], (value: any) => { hooks.slots[index] = typeof value === 'function' ? value(hooks.slots[index]) : value }]
  },
  useRef: (initial: unknown) => {
    const index = hooks.cursor++
    return hooks.slots[index] ??= { current: initial }
  },
  useEffect: (effect: () => void | (() => void), deps: unknown[]) => {
    const index = hooks.cursor++
    if (!hooks.slots[index] || deps.some((value, offset) => hooks.slots[index][offset] !== value)) {
      hooks.slots[index] = deps
      hooks.effects.push(effect)
    }
  },
}))
import { ReasoningDropdown } from '../src/client/reasoning-dropdown.tsx'

type Element = ReactElement<any>
function elements(value: any): Element[] {
  if (Array.isArray(value)) return value.flatMap(elements)
  if (!value || typeof value !== 'object' || !value.props) return []
  return [value, ...elements(value.props.children)]
}
const listeners = new Map<string, (event: any) => void>()
const triggerFocus = vi.fn()
const dialogFocus = vi.fn()
let settings: Partial<CodexSettings>
let writable: boolean
let setSetting: ReturnType<typeof vi.fn>
function render(capabilityNotice?: string) {
  hooks.cursor = 0
  const tree = ReasoningDropdown({
    useSettings: () => ({ value: settings as CodexSettings, writable }),
    setSetting,
    t: () => '',
    capabilityNotice,
  })
  const all = elements(tree)
  for (const element of all) {
    const ref = (element as Element & { ref?: { current: unknown } }).ref
    if (ref) ref.current = {
      focus: element.props.role === 'dialog' ? dialogFocus : triggerFocus,
      contains: () => false,
    }
  }
  for (const effect of hooks.effects.splice(0)) {
    const cleanup = effect()
    if (cleanup) hooks.cleanups.push(cleanup)
  }
  return all
}
function open() {
  render().find(element => element.props['aria-haspopup'] === 'dialog')!.props.onClick()
  return render()
}
const option = (all: Element[], key: string) => all.find(element => element.key === key)!

beforeEach(() => {
  hooks.slots = []; hooks.effects = []; hooks.cleanups = []
  listeners.clear(); triggerFocus.mockClear(); dialogFocus.mockClear()
  settings = { fast: false, reasoningEffort: 'default' }
  writable = true
  setSetting = vi.fn().mockResolvedValue(undefined)
  vi.stubGlobal('document', {
    addEventListener: (name: string, listener: (event: any) => void) => listeners.set(name, listener),
    removeEventListener: (name: string) => listeners.delete(name),
  })
  vi.stubGlobal('Node', class {})
})
afterEach(() => {
  hooks.cleanups.forEach(cleanup => cleanup())
  vi.unstubAllGlobals()
})

describe('Reasoning dropdown interaction', () => {
  it('independently hides Fast and effort, including their trigger states', () => {
    settings.fastModeControlEnabled = false
    settings.fast = true
    let all = open()
    expect(all.some(element => element.props.role === 'switch')).toBe(false)
    expect(option(all, 'default')).toBeDefined()
    settings.fastModeControlEnabled = true
    settings.reasoningEffortControlEnabled = false
    all = render()
    expect(all.some(element => element.props.role === 'switch')).toBe(true)
    expect(option(all, 'default')).toBeUndefined()
    settings.fastModeControlEnabled = false
    expect(render()).toEqual([])
  })

  it('selects inherited default and returns focus only after a successful save', async () => {
    let resolve!: () => void
    setSetting.mockImplementation(() => new Promise<void>(done => { resolve = done }))
    const all = open()
    expect(dialogFocus).toHaveBeenCalled()
    const trigger = all.find(element => element.props['aria-haspopup'])!
    expect(trigger.props['aria-controls']).toBe('reasoning-dialog')
    expect(option(all, 'default').props['aria-pressed']).toBe(true)
    option(all, 'high').props.onClick()
    expect(render().find(element => element.props.role === 'dialog')!.props['aria-busy']).toBe(true)
    option(render(), 'low').props.onClick()
    expect(setSetting).toHaveBeenCalledTimes(1)
    resolve(); await Promise.resolve(); await Promise.resolve()
    expect(render().some(element => element.props.role === 'dialog')).toBe(false)
    expect(triggerFocus).toHaveBeenCalled()
    open()
    option(render(), 'default').props.onClick()
    expect(setSetting).toHaveBeenLastCalledWith('reasoningEffort', 'default')
  })

  it('keeps failed writes visible, clears error on retry, and does not fake a selected value', async () => {
    setSetting.mockRejectedValueOnce(new Error('connection lost'))
    option(open(), 'high').props.onClick()
    await Promise.resolve(); await Promise.resolve()
    let all = render()
    expect(all.some(element => element.props.role === 'alert')).toBe(true)
    expect(all.some(element => element.props.children === 'connection lost')).toBe(true)
    expect(option(all, 'default').props['aria-pressed']).toBe(true)
    option(all, 'high').props.onClick()
    await Promise.resolve(); await Promise.resolve()
    all = render()
    expect(all.some(element => element.props.role === 'dialog')).toBe(false)
  })

  it('restores trigger focus on Escape and exposes only a supplied capability notice', () => {
    open()
    expect(render().some(element => element.props.role === 'status')).toBe(false)
    expect(render('Provider capability not yet verified').some(element => element.props.children === 'Provider capability not yet verified')).toBe(true)
    const preventDefault = vi.fn()
    listeners.get('keydown')!({ key: 'Escape', preventDefault })
    expect(preventDefault).toHaveBeenCalled()
    expect(triggerFocus).toHaveBeenCalled()
    expect(render().some(element => element.props.role === 'dialog')).toBe(false)
  })

  it('reports Fast save failures and keeps the menu open after a retry', async () => {
    setSetting.mockRejectedValueOnce(new Error('write rejected'))
    open().find(element => element.props.role === 'switch')!.props.onChange({ target: { checked: true } })
    await Promise.resolve(); await Promise.resolve()
    expect(render().some(element => element.props.role === 'alert')).toBe(true)
    render().find(element => element.props.role === 'switch')!.props.onChange({ target: { checked: true } })
    await Promise.resolve(); await Promise.resolve()
    const all = render()
    expect(all.some(element => element.props.role === 'dialog')).toBe(true)
    expect(all.some(element => element.props.role === 'alert')).toBe(false)
    expect(setSetting).toHaveBeenLastCalledWith('fast', true)
  })

  it('blocks writes to read-only settings', () => {
    writable = false
    const all = render()
    expect(all.find(element => element.props['aria-haspopup'])!.props.disabled).toBe(true)
    expect(setSetting).not.toHaveBeenCalled()
  })
})
