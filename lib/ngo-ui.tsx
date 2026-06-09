'use client'

import { createContext, useCallback, useContext, useRef, useState, type ReactNode, type CSSProperties } from 'react'

// Shared NGO-dashboard UI primitives: transient toasts + a styled confirm dialog. These replace
// native window.confirm/alert (jarring, unstyled) and the "modal closes with no feedback" pattern
// across the NGO screens. Mounted once in app/ngo/layout.tsx so every authenticated page can call
// useToast() / useConfirm() without re-implementing a modal. Design-system colours, inline styles.

type ToastKind = 'success' | 'error' | 'info'
interface ToastItem { id: number; kind: ToastKind; text: string }

const ToastCtx = createContext<(text: string, kind?: ToastKind) => void>(() => {})
/** Show a transient toast: `toast('Saved')`, `toast('Failed', 'error')`. */
export function useToast() { return useContext(ToastCtx) }

export interface ConfirmOptions {
  title: string
  body?: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
}
const ConfirmCtx = createContext<(opts: ConfirmOptions) => Promise<boolean>>(async () => false)
/** Styled replacement for window.confirm: `if (!(await confirm({ title }))) return`. */
export function useConfirm() { return useContext(ConfirmCtx) }

export function NgoUiProvider({ children }: { children: ReactNode }) {
  // ── Toasts ──
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const idRef = useRef(0)
  const toast = useCallback((text: string, kind: ToastKind = 'success') => {
    const id = ++idRef.current
    setToasts((t) => [...t, { id, kind, text }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3500)
  }, [])

  // ── Confirm ──
  const [confirmState, setConfirmState] = useState<(ConfirmOptions & { resolve: (v: boolean) => void }) | null>(null)
  const confirm = useCallback(
    (opts: ConfirmOptions) => new Promise<boolean>((resolve) => setConfirmState({ ...opts, resolve })),
    [],
  )
  const closeConfirm = (v: boolean) => { confirmState?.resolve(v); setConfirmState(null) }

  return (
    <ConfirmCtx.Provider value={confirm}>
      <ToastCtx.Provider value={toast}>
        {children}

        {/* Toaster — fixed, bottom-centre, above modals; non-interactive */}
        <div style={toastWrap} aria-live="polite">
          {toasts.map((t) => (
            <div key={t.id} style={toastBox(t.kind)}>{t.text}</div>
          ))}
        </div>

        {/* Confirm dialog */}
        {confirmState && (
          <div style={confirmBackdrop} onClick={() => closeConfirm(false)}>
            <div style={confirmBox} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
              <div style={{ fontSize: 15, fontWeight: 600, marginBottom: confirmState.body ? 8 : 16 }}>{confirmState.title}</div>
              {confirmState.body && <div style={{ fontSize: 13, color: '#8b949e', marginBottom: 18, lineHeight: 1.5 }}>{confirmState.body}</div>}
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => closeConfirm(false)} style={btnCancel}>{confirmState.cancelLabel ?? 'Cancel'}</button>
                <button type="button" onClick={() => closeConfirm(true)} style={confirmState.danger ? btnDanger : btnConfirm}>{confirmState.confirmLabel ?? 'Confirm'}</button>
              </div>
            </div>
          </div>
        )}
      </ToastCtx.Provider>
    </ConfirmCtx.Provider>
  )
}

// ── styles ──
const toastWrap: CSSProperties = { position: 'fixed', bottom: 20, insetInlineStart: '50%', transform: 'translateX(-50%)', zIndex: 9999, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, pointerEvents: 'none', maxWidth: '90vw' }
function toastBox(kind: ToastKind): CSSProperties {
  const c = kind === 'error' ? { fg: '#f85149', bd: 'rgba(248,81,73,0.4)', bg: 'rgba(248,81,73,0.12)' }
    : kind === 'info' ? { fg: '#58a6ff', bd: 'rgba(88,166,255,0.4)', bg: 'rgba(88,166,255,0.12)' }
    : { fg: '#3fb950', bd: 'rgba(63,185,80,0.4)', bg: 'rgba(63,185,80,0.12)' }
  return { background: '#161b22', color: c.fg, border: `1px solid ${c.bd}`, boxShadow: '0 4px 18px rgba(0,0,0,0.5)', borderRadius: 8, padding: '10px 16px', fontSize: 13, fontWeight: 500, fontFamily: 'system-ui', maxWidth: '90vw', textAlign: 'center', backdropFilter: 'blur(4px)' }
}
const confirmBackdrop: CSSProperties = { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 10000, padding: 16 }
const confirmBox: CSSProperties = { width: 360, maxWidth: '100%', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: 22, fontFamily: 'system-ui', color: '#e6edf3' }
const btnBase: CSSProperties = { flex: 1, height: 38, borderRadius: 6, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const btnCancel: CSSProperties = { ...btnBase, background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#8b949e' }
const btnConfirm: CSSProperties = { ...btnBase, background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.35)', color: '#58a6ff' }
const btnDanger: CSSProperties = { ...btnBase, background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.4)', color: '#f85149' }
