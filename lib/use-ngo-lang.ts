'use client'

import { createContext, useCallback, useContext, useEffect, useState } from 'react'

// Shared language state for the NGO dashboard. Mirrors the civilian pattern (site-wide
// `fl_lang` localStorage key, en/fr/ar, RTL when Arabic) but centralised so the layout can
// host ONE toggle + set dir once, and every authenticated screen re-renders together when the
// language changes (via NgoLangContext). Each screen keeps its own LANG dictionary and builds
// `t` from it; this only owns the current language + persistence + RTL flag.

export type Lang = 'en' | 'fr' | 'ar'

export interface NgoLang {
  lang: Lang
  isRtl: boolean
  changeLang: (l: Lang) => void
}

function isLang(v: unknown): v is Lang { return v === 'en' || v === 'fr' || v === 'ar' }

// State owner — called once in the layout. Arabic-first default (per the product principle);
// overridden by a stored fl_lang, then (best-effort) by the user's saved account language.
export function useNgoLangState(): NgoLang {
  const [lang, setLang] = useState<Lang>('ar')
  useEffect(() => {
    try { const s = localStorage.getItem('fl_lang'); if (isLang(s)) setLang(s) } catch { /* storage off */ }
    // Hydrate from the user's saved account language (covers a fresh device with no fl_lang).
    fetch('/api/ngo/me', { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { const l = d?.account?.language; if (isLang(l)) { setLang(l); try { localStorage.setItem('fl_lang', l) } catch { /* */ } } })
      .catch(() => { /* offline — keep local */ })
  }, [])
  const changeLang = useCallback((l: Lang) => {
    setLang(l)
    try { localStorage.setItem('fl_lang', l) } catch { /* storage off */ }
  }, [])
  return { lang, isRtl: lang === 'ar', changeLang }
}

export const NgoLangContext = createContext<NgoLang>({ lang: 'en', isRtl: false, changeLang: () => {} })
/** Consume the dashboard's current language/RTL flag + changer. */
export function useNgoLang(): NgoLang { return useContext(NgoLangContext) }

/** Build a `t` for a screen's own dictionary: `const t = makeT(LANG, lang)`. */
export function makeT<D extends Record<Lang, Record<string, string>>>(dict: D, lang: Lang) {
  return (key: string): string => (dict[lang]?.[key] ?? dict.en[key] ?? key)
}
