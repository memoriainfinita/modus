// The preferences that belong to a panel, in its ⋯ menu as well as in Settings: one value,
// two places. A number steps with − and +, a choice is a row of chips, a switch an item,
// a set a row of chips that each turn on or off.

import { PREFS, getPref, setPref, onPrefChange, type PrefName, type PrefDef } from '../settings/prefs'
import { prefLabel, prefOptionLabel, formatPrefValue } from './settings'
import { escapeHtml } from './html'
import { t } from '../i18n/i18n'
import type { ModuleId } from '../layout/presets'

export const PANEL_PREFS: Partial<Record<ModuleId, PrefName[]>> = {
  analysis: ['voice-rules'],
  explain: ['movable-do'],
  piano: ['piano-velocity'],
  history: ['history-hold-ms', 'history-max', 'history-bpm', 'history-beats'],
  progressions: ['progression-bpm'],
  ear: ['ear-interval-play', 'ear-chords', 'ear-cadences'],
  tuner: ['a4-hz', 'mic-sensitivity', 'mic-response'],
}

function itemHtml(name: PrefName): string {
  const def = PREFS[name] as PrefDef
  const v = getPref(name)
  const label = escapeHtml(prefLabel(name))
  switch (def.kind) {
    case 'number': return `
      <div class="menu-row"><span class="menu-label">${label}</span>
        <button type="button" class="menu-step" data-pref-step="${name}" data-dir="-1" aria-label="${escapeHtml(t('ctrl.smaller'))}">−</button>
        <span class="menu-value" data-pref-value="${name}">${escapeHtml(formatPrefValue(def, v as number))}</span>
        <button type="button" class="menu-step" data-pref-step="${name}" data-dir="1" aria-label="${escapeHtml(t('ctrl.larger'))}">+</button></div>`
    case 'bool': return `
      <button type="button" class="menu-item" data-pref-bool="${name}" aria-pressed="${v}"><span class="menu-check" aria-hidden="true"></span><span class="menu-label">${label}</span></button>`
    case 'choice': return `<div class="menu-heading">${label}</div><div class="menu-chips">${def.options.map(o =>
      `<button type="button" class="menu-chip" data-pref-choice="${name}" data-value="${escapeHtml(o)}" data-label="${escapeHtml(`${prefLabel(name)}: ${prefOptionLabel(name, o)}`)}" aria-pressed="${o === v}">${escapeHtml(prefOptionLabel(name, o))}</button>`).join('')}</div>`
    case 'set': return `<div class="menu-heading">${label}</div><div class="menu-chips">${def.options.map(o =>
      `<button type="button" class="menu-chip" data-pref-set="${name}" data-value="${escapeHtml(o)}" data-label="${escapeHtml(`${prefLabel(name)}: ${prefOptionLabel(name, o)}`)}" aria-pressed="${(v as string[]).includes(o)}">${escapeHtml(prefOptionLabel(name, o))}</button>`).join('')}</div>`
  }
}

/** The preference items of a panel's menu, after its own options; '' for a panel with none. */
export function prefMenuHtml(id: ModuleId): string {
  const names = PANEL_PREFS[id]
  if (!names) return ''
  // Ear training: its score back to zero, as in Settings
  const extra = id === 'ear' ? `<button type="button" class="menu-item menu-action" data-ear-reset><span class="menu-label">${escapeHtml(t('set.ear.reset'))}</span></button>` : ''
  return `<div class="pref-items" data-pref-panel="${id}">${names.map(itemHtml).join('')}${extra}</div>`
}

/** Each change, from a menu or from Settings, shows in every menu that has it. */
function refresh(name: PrefName) {
  const def = PREFS[name] as PrefDef
  const v = getPref(name)
  document.querySelectorAll<HTMLElement>(`[data-pref-value="${name}"]`).forEach(e => { e.textContent = formatPrefValue(def as { unit: string }, v as number) })
  document.querySelectorAll<HTMLElement>(`[data-pref-bool="${name}"]`).forEach(e => e.setAttribute('aria-pressed', String(v)))
  document.querySelectorAll<HTMLElement>(`[data-pref-choice="${name}"]`).forEach(e => e.setAttribute('aria-pressed', String(e.dataset.value === v)))
  document.querySelectorAll<HTMLElement>(`[data-pref-set="${name}"]`).forEach(e => e.setAttribute('aria-pressed', String((v as string[]).includes(e.dataset.value!))))
}

export function wirePrefMenus() {
  document.addEventListener('click', e => {
    const b = (e.target as HTMLElement).closest<HTMLElement>('.pref-items button')
    if (!b) return
    if (b.dataset.prefStep) {
      const name = b.dataset.prefStep as PrefName
      const def = PREFS[name] as Extract<PrefDef, { kind: 'number' }>
      const next = Math.round(((getPref(name) as number) + Number(b.dataset.dir) * def.step) * 1000) / 1000
      setPref(name, Math.min(def.max, Math.max(def.min, next)) as never)
    } else if (b.dataset.prefBool) {
      const name = b.dataset.prefBool as PrefName
      setPref(name, !getPref(name) as never)
    } else if (b.dataset.prefChoice) {
      setPref(b.dataset.prefChoice as PrefName, b.dataset.value as never)
    } else if (b.dataset.prefSet) {
      const name = b.dataset.prefSet as PrefName
      const now = getPref(name) as string[]
      const v = b.dataset.value!
      setPref(name, (now.includes(v) ? now.filter(x => x !== v) : [...now, v]) as never)
    }
  })
  onPrefChange(refresh)
}
