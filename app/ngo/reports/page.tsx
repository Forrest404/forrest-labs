'use client'

import { useState, useEffect, useCallback } from 'react'
import { useConfirm, useToast, SkeletonRows } from '@/lib/ngo-ui'
import { useNgoLang, makeT } from '@/lib/use-ngo-lang'

const LANG = {
  en: { title: 'Reports', forbidden: 'Reports are available to team leaders and organisation admins.', sub: 'Generate situation reports from your incidents and dispatches, and export your data.', gen_title: 'Generate situation report', from: 'From', to: 'To', title_opt: 'Title (optional)', title_ph: 'Auto-titled from the date range', generating: 'Generating…', generate: 'Generate report', close: 'Close', no_draft: 'No AI narrative was generated for this report (the underlying data is still saved and exportable).', export_word: 'Export Word', print_pdf: 'Print / Save as PDF', saved: 'Saved reports', loading: 'Loading…', load_fail: 'Couldn’t load reports.', retry: 'Retry', empty: 'No reports yet — generate one above.', view: 'View', word: 'Word', del: 'Delete', data_only: 'data only', export: 'Export data', export_desc: 'Download your incidents and dispatches for the selected range above.', csv: 'Download CSV', geojson: 'Download GeoJSON', gen_fail: 'Generation failed.', gen_fail_net: 'Generation failed — check your connection and try again.', generated: 'Situation report generated.', open_fail: 'Could not open that report.', del_fail: 'Delete failed.', deleted: 'Report deleted', confirm_del_title: 'Delete', confirm_del_body: 'This cannot be undone.', confirm_del: 'Delete' },
  fr: { title: 'Rapports', forbidden: 'Les rapports sont réservés aux chefs d’équipe et administrateurs.', sub: 'Générez des rapports de situation à partir de vos incidents et déploiements, et exportez vos données.', gen_title: 'Générer un rapport de situation', from: 'Du', to: 'Au', title_opt: 'Titre (facultatif)', title_ph: 'Titré automatiquement selon la période', generating: 'Génération…', generate: 'Générer le rapport', close: 'Fermer', no_draft: 'Aucun récit IA généré pour ce rapport (les données restent enregistrées et exportables).', export_word: 'Exporter Word', print_pdf: 'Imprimer / Enregistrer en PDF', saved: 'Rapports enregistrés', loading: 'Chargement…', load_fail: 'Échec du chargement des rapports.', retry: 'Réessayer', empty: 'Aucun rapport — générez-en un ci-dessus.', view: 'Voir', word: 'Word', del: 'Supprimer', data_only: 'données seules', export: 'Exporter les données', export_desc: 'Téléchargez vos incidents et déploiements pour la période sélectionnée ci-dessus.', csv: 'Télécharger CSV', geojson: 'Télécharger GeoJSON', gen_fail: 'Échec de la génération.', gen_fail_net: 'Échec de la génération — vérifiez votre connexion et réessayez.', generated: 'Rapport de situation généré.', open_fail: 'Impossible d’ouvrir ce rapport.', del_fail: 'Échec de la suppression.', deleted: 'Rapport supprimé', confirm_del_title: 'Supprimer', confirm_del_body: 'Cette action est irréversible.', confirm_del: 'Supprimer' },
  ar: { title: 'التقارير', forbidden: 'التقارير متاحة لقادة الفرق ومسؤولي المنظمة.', sub: 'أنشئ تقارير الوضع من حوادثك وعمليات الإيفاد، وصدّر بياناتك.', gen_title: 'إنشاء تقرير وضع', from: 'من', to: 'إلى', title_opt: 'العنوان (اختياري)', title_ph: 'عنوان تلقائي حسب الفترة', generating: 'جارٍ الإنشاء…', generate: 'إنشاء التقرير', close: 'إغلاق', no_draft: 'لم يُنشأ سرد بالذكاء الاصطناعي لهذا التقرير (البيانات محفوظة وقابلة للتصدير).', export_word: 'تصدير Word', print_pdf: 'طباعة / حفظ PDF', saved: 'التقارير المحفوظة', loading: 'جارٍ التحميل…', load_fail: 'تعذّر تحميل التقارير.', retry: 'إعادة المحاولة', empty: 'لا توجد تقارير — أنشئ واحداً أعلاه.', view: 'عرض', word: 'Word', del: 'حذف', data_only: 'بيانات فقط', export: 'تصدير البيانات', export_desc: 'نزّل حوادثك وعمليات الإيفاد للفترة المحددة أعلاه.', csv: 'تنزيل CSV', geojson: 'تنزيل GeoJSON', gen_fail: 'فشل الإنشاء.', gen_fail_net: 'فشل الإنشاء — تحقق من اتصالك وحاول مجدداً.', generated: 'تم إنشاء تقرير الوضع.', open_fail: 'تعذّر فتح هذا التقرير.', del_fail: 'فشل الحذف.', deleted: 'تم حذف التقرير', confirm_del_title: 'حذف', confirm_del_body: 'لا يمكن التراجع عن هذا.', confirm_del: 'حذف' },
} as const

// NGO Reports — generate OCHA-style situation reports from this org's incidents,
// dispatches and on-scene reports; save, view, re-export, delete; and export raw
// data (CSV / GeoJSON). org_admin + team_leader only (the nav hides this for
// field_coordinator and every API route enforces the role server-side).

interface SavedReport {
  id: string
  title: string
  period_start: string
  period_end: string
  created_at: string
  has_draft: boolean
}
interface FullReport extends SavedReport {
  draft: string | null
  data: unknown
}

function todayISO() { return new Date().toISOString().slice(0, 10) }
function daysAgoISO(n: number) { return new Date(Date.now() - n * 86400000).toISOString().slice(0, 10) }

export default function NgoReportsPage() {
  const confirm = useConfirm()
  const toast = useToast()
  const { lang, isRtl } = useNgoLang()
  const t = makeT(LANG, lang)
  const [start, setStart] = useState(daysAgoISO(7))
  const [end, setEnd] = useState(todayISO())
  const [title, setTitle] = useState('')
  const [generating, setGenerating] = useState(false)
  const [note, setNote] = useState<{ kind: 'info' | 'error'; text: string } | null>(null)

  const [reports, setReports] = useState<SavedReport[]>([])
  const [listLoaded, setListLoaded] = useState(false)
  const [listError, setListError] = useState(false)
  const [forbidden, setForbidden] = useState(false)

  const [open, setOpen] = useState<FullReport | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)

  const loadList = useCallback(async () => {
    setListError(false)
    try {
      const r = await fetch('/api/ngo/reports', { cache: 'no-store' })
      if (r.status === 403) { setForbidden(true); setListLoaded(true); return }
      if (r.ok) setReports((await r.json()).reports ?? [])
      else setListError(true)
    } catch { setListError(true) }
    setListLoaded(true)
  }, [])
  useEffect(() => { loadList() }, [loadList])

  const generate = useCallback(async () => {
    setGenerating(true); setNote(null)
    try {
      const r = await fetch('/api/ngo/reports/generate', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ period_start: start, period_end: end, title: title.trim() || undefined }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.status === 403) { setForbidden(true); return }
      if (!r.ok) { setNote({ kind: 'error', text: d?.error ?? t('gen_fail') }); return }
      setTitle('')
      await loadList()
      // Open the freshly generated report so the draft shows immediately.
      if (d.report?.id) await view(d.report.id)
      setNote(d.ai_error ? { kind: 'info', text: d.ai_error } : { kind: 'info', text: t('generated') })
    } catch {
      setNote({ kind: 'error', text: t('gen_fail_net') })
    } finally { setGenerating(false) }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, title, loadList])

  const view = useCallback(async (id: string) => {
    setBusyId(id)
    try {
      const r = await fetch(`/api/ngo/reports/${id}`, { cache: 'no-store' })
      if (r.ok) setOpen((await r.json()).report)
      else setNote({ kind: 'error', text: t('open_fail') })
    } catch { setNote({ kind: 'error', text: t('open_fail') }) }
    finally { setBusyId(null) }
  }, [])

  const del = useCallback(async (rep: SavedReport) => {
    if (!(await confirm({ title: `${t('confirm_del_title')} “${rep.title}”?`, body: t('confirm_del_body'), danger: true, confirmLabel: t('confirm_del') }))) return
    setBusyId(rep.id)
    try {
      const r = await fetch(`/api/ngo/reports/${rep.id}`, { method: 'DELETE' })
      if (r.ok) { setReports((prev) => prev.filter((x) => x.id !== rep.id)); if (open?.id === rep.id) setOpen(null); toast(t('deleted')) }
      else setNote({ kind: 'error', text: t('del_fail') })
    } catch { setNote({ kind: 'error', text: t('del_fail') }) }
    finally { setBusyId(null) }
  }, [open])

  const exportData = (format: 'csv' | 'geojson') => {
    const u = `/api/ngo/reports/export-data?format=${format}&start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`
    window.open(u, '_blank')
  }

  if (forbidden) {
    return (
      <div className="ngo-page" style={wrap} dir={isRtl ? 'rtl' : 'ltr'}>
        <h1 style={h1}>{t('title')}</h1>
        <div style={emptyBox}>{t('forbidden')}</div>
      </div>
    )
  }

  return (
    <div className="ngo-page" style={wrap} dir={isRtl ? 'rtl' : 'ltr'}>
      <h1 style={h1}>{t('title')}</h1>
      <p style={sub}>{t('sub')}</p>

      {note && (
        <div style={note.kind === 'error' ? errBox : infoBox}>{note.text}</div>
      )}

      {/* (a) Generate */}
      <section style={card}>
        <div style={cardTitle}>{t('gen_title')}</div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 10 }}>
          <label style={field}><span style={lbl}>{t('from')}</span><input type="date" value={start} max={end} onChange={(e) => setStart(e.target.value)} style={input} /></label>
          <label style={field}><span style={lbl}>{t('to')}</span><input type="date" value={end} min={start} max={todayISO()} onChange={(e) => setEnd(e.target.value)} style={input} /></label>
        </div>
        <label style={{ ...field, width: '100%' }}><span style={lbl}>{t('title_opt')}</span>
          <input type="text" value={title} placeholder={t('title_ph')} onChange={(e) => setTitle(e.target.value)} style={input} />
        </label>
        <button type="button" onClick={generate} disabled={generating} style={{ ...primaryBtn, marginTop: 12, opacity: generating ? 0.6 : 1 }}>
          {generating ? t('generating') : t('generate')}
        </button>
      </section>

      {/* Open report viewer */}
      {open && (
        <section style={{ ...card, borderColor: '#3fb950' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
            <div style={cardTitle}>{open.title}</div>
            <button type="button" onClick={() => setOpen(null)} style={ghostBtn}>{t('close')}</button>
          </div>
          <div style={{ fontSize: 12, color: '#8b949e', marginBottom: 12 }}>
            {String(open.period_start).slice(0, 10)} → {String(open.period_end).slice(0, 10)}
          </div>
          <div id="report-draft" style={{ fontSize: 14, lineHeight: 1.6, color: '#e6edf3', whiteSpace: 'pre-wrap', background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 14 }}>
            {open.draft ?? t('no_draft')}
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 12, flexWrap: 'wrap' }}>
            <button type="button" onClick={() => window.open(`/api/ngo/reports/${open.id}/export?format=doc`, '_blank')} style={secondaryBtn}>{t('export_word')}</button>
            <button type="button" onClick={() => printDraft(open)} style={secondaryBtn}>{t('print_pdf')}</button>
          </div>
        </section>
      )}

      {/* (b) Saved reports */}
      <section style={card}>
        <div style={cardTitle}>{t('saved')}</div>
        {!listLoaded && <SkeletonRows rows={3} height={52} />}
        {listError && <div style={errBox}>{t('load_fail')} <button type="button" onClick={loadList} style={retryBtn}>{t('retry')}</button></div>}
        {listLoaded && !listError && reports.length === 0 && <div style={emptyBox}>{t('empty')}</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {reports.map((rep) => (
            <div key={rep.id} style={row}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{rep.title}</div>
                <div style={{ fontSize: 12, color: '#8b949e', marginTop: 2 }}>
                  {String(rep.period_start).slice(0, 10)} → {String(rep.period_end).slice(0, 10)} · {new Date(rep.created_at).toLocaleDateString()}{!rep.has_draft ? ` · ${t('data_only')}` : ''}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button type="button" disabled={busyId === rep.id} onClick={() => view(rep.id)} style={miniBtn}>{t('view')}</button>
                <button type="button" onClick={() => window.open(`/api/ngo/reports/${rep.id}/export?format=doc`, '_blank')} style={miniBtn}>{t('word')}</button>
                <button type="button" disabled={busyId === rep.id} onClick={() => del(rep)} style={{ ...miniBtn, color: '#f85149', borderColor: 'rgba(248,81,73,0.4)' }}>{t('del')}</button>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* (c) Export data */}
      <section style={card}>
        <div style={cardTitle}>{t('export')}</div>
        <p style={{ fontSize: 12, color: '#8b949e', margin: '0 0 10px' }}>{t('export_desc')}</p>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button type="button" onClick={() => exportData('csv')} style={secondaryBtn}>{t('csv')}</button>
          <button type="button" onClick={() => exportData('geojson')} style={secondaryBtn}>{t('geojson')}</button>
        </div>
      </section>
    </div>
  )
}

// Open the draft in a print window so the user can Save as PDF without a PDF lib.
function printDraft(rep: FullReport) {
  const w = window.open('', '_blank')
  if (!w) return
  const body = (rep.draft ?? 'No narrative generated.').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c] as string))
  w.document.write(
    `<!doctype html><html><head><meta charset="utf-8"/><title>${rep.title}</title>` +
    `<style>body{font-family:system-ui,Arial,sans-serif;max-width:720px;margin:32px auto;padding:0 20px;color:#111;line-height:1.6}` +
    `h1{font-size:20px}.meta{color:#666;font-size:12px;margin-bottom:20px}pre{white-space:pre-wrap;font-family:inherit;font-size:14px}</style></head>` +
    `<body><h1>${rep.title}</h1><div class="meta">${String(rep.period_start).slice(0, 10)} → ${String(rep.period_end).slice(0, 10)}</div>` +
    `<pre>${body}</pre></body></html>`,
  )
  w.document.close()
  w.focus()
  setTimeout(() => w.print(), 250)
}

// ── styles (design system; mobile-first) ──
const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '24px 16px', fontFamily: 'system-ui, sans-serif' }
const h1: React.CSSProperties = { fontSize: 20, fontWeight: 600, margin: '0 0 4px', color: '#e6edf3' }
const sub: React.CSSProperties = { fontSize: 13, color: '#8b949e', margin: '0 0 20px' }
const card: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: 16, marginBottom: 16 }
const cardTitle: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: '#e6edf3', marginBottom: 12 }
const field: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 4, flex: 1, minWidth: 130 }
const lbl: React.CSSProperties = { fontSize: 11, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.06em' }
const input: React.CSSProperties = { height: 38, boxSizing: 'border-box', background: '#0d1117', border: '1px solid #21262d', borderRadius: 6, color: '#e6edf3', fontSize: 14, padding: '0 10px', fontFamily: 'system-ui', outline: 'none' }
const primaryBtn: React.CSSProperties = { height: 42, padding: '0 18px', background: '#238636', border: '1px solid #2ea043', color: '#fff', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui', width: '100%' }
const secondaryBtn: React.CSSProperties = { height: 38, padding: '0 14px', background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.4)', color: '#58a6ff', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const ghostBtn: React.CSSProperties = { height: 30, padding: '0 12px', background: 'transparent', border: '1px solid #21262d', color: '#8b949e', borderRadius: 6, fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
const miniBtn: React.CSSProperties = { height: 32, padding: '0 12px', background: 'rgba(255,255,255,0.04)', border: '1px solid #21262d', color: '#c9d1d9', borderRadius: 6, fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'system-ui' }
const row: React.CSSProperties = { display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, background: '#0d1117', border: '1px solid #21262d', borderRadius: 8, padding: 12 }
const muted: React.CSSProperties = { fontSize: 13, color: '#8b949e' }
const emptyBox: React.CSSProperties = { fontSize: 13, color: '#484f58', padding: '24px 0', textAlign: 'center' }
const infoBox: React.CSSProperties = { background: 'rgba(88,166,255,0.1)', border: '1px solid rgba(88,166,255,0.3)', color: '#58a6ff', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const errBox: React.CSSProperties = { background: 'rgba(248,81,73,0.1)', border: '1px solid rgba(248,81,73,0.3)', color: '#f85149', borderRadius: 8, padding: '10px 14px', fontSize: 13, marginBottom: 16 }
const retryBtn: React.CSSProperties = { marginLeft: 8, background: 'transparent', border: '1px solid #f85149', color: '#f85149', borderRadius: 5, padding: '2px 10px', fontSize: 12, cursor: 'pointer', fontFamily: 'system-ui' }
