// Light / dark / system theme. The choice is saved per browser; "system" follows the device.
// index.html applies it before the page draws, so there's no white flash.
import { useEffect, useState } from 'react'

const KEY = 'skilltrack-theme'
const media = () => window.matchMedia?.('(prefers-color-scheme: dark)')

export function getThemeChoice() {
  try { return localStorage.getItem(KEY) || 'system' } catch { return 'system' }
}
export function resolveTheme(choice = getThemeChoice()) {
  return choice === 'system' ? (media()?.matches ? 'dark' : 'light') : choice
}
export function applyTheme(choice = getThemeChoice()) {
  document.documentElement.dataset.theme = resolveTheme(choice)
}

export function useTheme() {
  const [choice, setChoice] = useState(getThemeChoice)
  useEffect(() => {
    applyTheme(choice)
    try { localStorage.setItem(KEY, choice) } catch { /* storage unavailable */ }
    if (choice !== 'system') return
    const m = media()
    const onChange = () => applyTheme('system')
    m?.addEventListener?.('change', onChange)
    return () => m?.removeEventListener?.('change', onChange)
  }, [choice])
  return [choice, setChoice]
}
