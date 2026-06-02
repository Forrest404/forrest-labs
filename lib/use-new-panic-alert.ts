import { useEffect, useRef, useState } from 'react'

// Alerts a leader/operator when a NEW panic appears while the panic monitor or situation board
// is open, so a duress alert can't scroll in (or pulse in on the map) unnoticed. Audible chime
// + a visual banner. Sound defaults ON; the operator can mute it for their session (persisted
// per device in localStorage, shared across both pages). The FIRST poll only establishes a
// baseline — it never blares for panics that were already active when the page opened.

const MUTE_KEY = 'nour-panic-muted'

function chime(): void {
  try {
    const Ctx = (window as any).AudioContext || (window as any).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    const beep = (at: number, f: number) => {
      const o = ctx.createOscillator(), g = ctx.createGain()
      o.type = 'sine'; o.frequency.value = f
      o.connect(g); g.connect(ctx.destination)
      const tm = ctx.currentTime + at
      g.gain.setValueAtTime(0.0001, tm)
      g.gain.exponentialRampToValueAtTime(0.4, tm + 0.02)
      g.gain.exponentialRampToValueAtTime(0.0001, tm + 0.4)
      o.start(tm); o.stop(tm + 0.42)
    }
    beep(0, 988); beep(0.45, 988); beep(0.9, 1319)
    setTimeout(() => { try { ctx.close() } catch { /* ignore */ } }, 1700)
  } catch { /* audio unavailable — the visual banner still fires */ }
}

export interface PanicLike { id: string; name: string }

export function useNewPanicAlert(panics: PanicLike[]): {
  muted: boolean
  toggleMute: () => void
  newNames: string[]
  dismiss: () => void
} {
  const [muted, setMuted] = useState(false)
  const [newNames, setNewNames] = useState<string[]>([])
  const seen = useRef<Set<string> | null>(null)
  const mutedRef = useRef(false)

  useEffect(() => { try { setMuted(localStorage.getItem(MUTE_KEY) === '1') } catch { /* ignore */ } }, [])
  useEffect(() => { mutedRef.current = muted }, [muted])

  useEffect(() => {
    // First run establishes the baseline silently — don't alert for already-active panics.
    if (seen.current === null) { seen.current = new Set(panics.map((p) => p.id)); return }
    const fresh = panics.filter((p) => !seen.current!.has(p.id))
    if (fresh.length) {
      for (const p of fresh) seen.current!.add(p.id)
      if (!mutedRef.current) chime()
      setNewNames((prev) => [...fresh.map((p) => p.name), ...prev].slice(0, 5))
    }
  }, [panics])

  const toggleMute = () => setMuted((m) => {
    const next = !m
    try { localStorage.setItem(MUTE_KEY, next ? '1' : '0') } catch { /* ignore */ }
    return next
  })
  const dismiss = () => setNewNames([])

  return { muted, toggleMute, newNames, dismiss }
}
