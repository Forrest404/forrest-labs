'use client'

import { useState, useEffect, useRef, useCallback } from 'react'

// ─── Translations ─────────────────────────────────────────────────────────────

const LANG = {
  en: {
    nav_map: 'Operations Map',
    nav_report: 'Report Incident',
    live_badge: 'LIVE',
    live_sub: 'Lebanon monitoring active',
    headline_1: 'When bombs fall,',
    headline_2: 'every second counts.',
    sub: 'Civilians report. AI verifies. Aid workers respond. In real time. No app required.',
    stat_reports: 'reports today',
    stat_confirmed: 'confirmed incidents',
    stat_warnings: 'active warnings',
    stat_uptime: 'system uptime',
    cta_primary: 'Report an Incident',
    cta_secondary: 'View Live Map',
    cta_note: 'Anonymous · No account required · Works on any phone',
    how_label: 'HOW IT WORKS',
    s1_num: '01', s1_title: 'You report in 15 seconds', s1_body: 'Tap four times to log what you heard, saw, or were warned about. No login. No app. Works on any phone anywhere in Lebanon.',
    s2_num: '02', s2_title: 'AI verifies instantly', s2_body: 'Reports from the same area are cross-referenced automatically. Coordinated fake reports are filtered out. Verified incidents appear on the map within 90 seconds.',
    s3_num: '03', s3_title: 'Aid reaches people faster', s3_body: 'Aid organisations see confirmed incidents in real time and deploy to where help is actually needed — not where they guess it is.',
    report_label: 'WHAT YOU CAN REPORT',
    strikes_title: 'Strikes', strike_1: 'Large explosion heard', strike_2: 'Shockwave or windows shaking', strike_3: 'Smoke or fire visible', strike_4: 'Aircraft or missiles overhead',
    warnings_title: 'Warnings', warn_1: 'Official IDF evacuation order', warn_2: 'Phone call warning to evacuate', warn_3: 'Community warning from neighbours', warn_4: 'Leaflet dropped from aircraft',
    privacy_label: 'BUILT FOR TRUST',
    p1_title: 'Anonymous by design', p1_body: 'No name, phone number, or account required. Ever.',
    p2_title: 'Location is approximate', p2_body: 'We store a general area, not your exact position. Faces in photos are automatically blurred.',
    p3_title: 'No surveillance', p3_body: 'This tool protects civilians. It will never be used for military targeting.',
    org_label: 'FOR ORGANISATIONS',
    org_dash_title: 'Partner dashboard', org_dash_body: 'NGO coordinators get real-time access to confirmed incidents and team dispatch — separate from civilian data.', org_dash_link: 'Request access →',
    org_export_title: 'Data export', org_export_body: 'All confirmed incident data is available as GeoJSON and CSV for import into your existing GIS and reporting tools.', org_export_link: 'Download sample →',
    org_api_title: 'API access', org_api_body: 'Live incident feed available for programmatic integration with existing humanitarian information systems.', org_api_link: 'View documentation →',
    footer_built: 'Built to protect civilians', footer_year: 'Forrest Labs · 2026',
  },
  fr: {
    nav_map: 'Carte Opérationnelle',
    nav_report: 'Signaler un Incident',
    live_badge: 'EN DIRECT',
    live_sub: 'Surveillance active — Liban',
    headline_1: 'Quand les bombes tombent,',
    headline_2: 'chaque seconde compte.',
    sub: "Les civils signalent. L'IA vérifie. Les équipes humanitaires interviennent. En temps réel. Sans application.",
    stat_reports: "signalements aujourd'hui",
    stat_confirmed: 'incidents confirmés',
    stat_warnings: 'alertes actives',
    stat_uptime: 'disponibilité système',
    cta_primary: 'Signaler un Incident',
    cta_secondary: 'Voir la Carte',
    cta_note: 'Anonyme · Sans compte · Fonctionne sur tout téléphone',
    how_label: 'COMMENT ÇA MARCHE',
    s1_num: '01', s1_title: 'Vous signalez en 15 secondes', s1_body: "Appuyez quatre fois pour signaler ce que vous avez entendu, vu ou dont vous avez été averti. Sans connexion. Sans application.",
    s2_num: '02', s2_title: "L'IA vérifie instantanément", s2_body: "Les signalements de la même zone sont recoupés automatiquement. Les faux signalements sont filtrés. Les incidents vérifiés apparaissent sur la carte en 90 secondes.",
    s3_num: '03', s3_title: "L'aide arrive plus vite", s3_body: "Les organisations humanitaires voient les incidents confirmés en temps réel et déploient leurs équipes là où l'aide est réellement nécessaire.",
    report_label: 'CE QUE VOUS POUVEZ SIGNALER',
    strikes_title: 'Frappes', strike_1: 'Grande explosion entendue', strike_2: 'Onde de choc ou fenêtres brisées', strike_3: 'Fumée ou incendie visible', strike_4: 'Avions ou missiles au-dessus',
    warnings_title: 'Avertissements', warn_1: "Ordre d'évacuation officiel IDF", warn_2: "Appel téléphonique d'évacuation", warn_3: 'Avertissement de voisins', warn_4: 'Tracts largués depuis un avion',
    privacy_label: 'CONÇU POUR LA CONFIANCE',
    p1_title: 'Anonymat par conception', p1_body: 'Aucun nom, numéro de téléphone ou compte requis. Jamais.',
    p2_title: 'Position approximative', p2_body: 'Nous stockons une zone générale, pas votre position exacte. Les visages sont automatiquement floutés.',
    p3_title: 'Zéro surveillance', p3_body: 'Cet outil protège les civils. Il ne sera jamais utilisé pour le ciblage militaire.',
    org_label: 'POUR LES ORGANISATIONS',
    org_dash_title: 'Tableau de bord partenaire', org_dash_body: "Les coordinateurs ONG accèdent en temps réel aux incidents confirmés et au déploiement des équipes — séparément des données civiles.", org_dash_link: "Demander l'accès →",
    org_export_title: 'Export de données', org_export_body: 'Toutes les données confirmées sont disponibles en GeoJSON et CSV pour vos outils SIG et de rapport existants.', org_export_link: 'Télécharger un exemple →',
    org_api_title: 'Accès API', org_api_body: "Flux d'incidents en direct pour l'intégration programmatique avec les systèmes d'information humanitaires existants.", org_api_link: 'Voir la documentation →',
    footer_built: 'Conçu pour protéger les civils', footer_year: 'Forrest Labs · 2026',
  },
  ar: {
    nav_map: 'خريطة العمليات',
    nav_report: 'بلّغ عن حادثة',
    live_badge: 'مباشر',
    live_sub: 'المراقبة شغّالة — لبنان',
    headline_1: 'لمّا القنابل بتوقع،',
    headline_2: 'كل ثانية بتحسب.',
    sub: 'المدنيين بيبلّغوا. الذكاء الاصطناعي بيتحقق. فرق الإغاثة بتتحرك. بالوقت الحقيقي. بدون تطبيق.',
    stat_reports: 'بلاغات اليوم',
    stat_confirmed: 'حوادث مؤكدة',
    stat_warnings: 'تحذيرات نشطة',
    stat_uptime: 'وقت تشغيل النظام',
    cta_primary: 'بلّغ عن حادثة',
    cta_secondary: 'شوف الخريطة المباشرة',
    cta_note: 'مجهول الهوية · بدون حساب · بيشتغل على أي تلفون',
    how_label: 'كيف بيشتغل',
    s1_num: '٠١', s1_title: 'بتبلّغ بـ 15 ثانية', s1_body: 'اضغط أربع مرات تسجّل شو سمعت أو شفت أو حذّروك منه. بدون تسجيل دخول. بدون تطبيق. بيشتغل على أي تلفون بلبنان.',
    s2_num: '٠٢', s2_title: 'الذكاء الاصطناعي بيتحقق على طول', s2_body: 'البلاغات من نفس المنطقة بتتقاطع تلقائياً. البلاغات الكاذبة بتنفلتر. الحوادث المؤكدة بتظهر على الخريطة خلال 90 ثانية.',
    s3_num: '٠٣', s3_title: 'المساعدة بتوصل أسرع', s3_body: 'منظمات الإغاثة بتشوف الحوادث المؤكدة بالوقت الحقيقي وبتنزّل فرقها لحيث في ناس محتاجين — مش لحيث بيخمّنوا.',
    report_label: 'شو فيك تبلّغ عنه',
    strikes_title: 'ضربات', strike_1: 'سمعت انفجار كبير', strike_2: 'موجة صدمة أو شبابيك اهتزّت', strike_3: 'في دخان أو نار شايفها', strike_4: 'طائرات أو صواريخ فوق',
    warnings_title: 'تحذيرات', warn_1: 'أمر إخلاء رسمي من الجيش الإسرائيلي', warn_2: 'مكالمة هاتفية تحذيرية', warn_3: 'تحذير من الجيران أو الواتساب', warn_4: 'منشورات نزّلوها من طائرة',
    privacy_label: 'مبني على الثقة',
    p1_title: 'مجهول الهوية بالتصميم', p1_body: 'ما في اسم ولا رقم هاتف ولا حساب مطلوب. أبداً.',
    p2_title: 'الموقع تقريبي', p2_body: 'بنحفظ منطقة عامة مش موقعك بالضبط. الوجوه بالصور بتتطمس تلقائياً.',
    p3_title: 'ما في مراقبة', p3_body: 'هالأداة بتحمي المدنيين. ما رح تُستخدم أبداً للاستهداف العسكري.',
    org_label: 'للمنظمات',
    org_dash_title: 'لوحة الشريك', org_dash_body: 'منسّقو المنظمات بيوصلوا بالوقت الحقيقي للحوادث المؤكدة وتوزيع الفرق — منفصل عن بيانات المدنيين.', org_dash_link: 'اطلب الوصول →',
    org_export_title: 'تصدير البيانات', org_export_body: 'كل بيانات الحوادث المؤكدة متوفرة بصيغة GeoJSON و CSV لاستيرادها بأدوات GIS والتقارير.', org_export_link: 'حمّل عيّنة →',
    org_api_title: 'وصول API', org_api_body: 'تدفق الحوادث المباشر متاح للتكامل البرمجي مع أنظمة المعلومات الإنسانية الموجودة.', org_api_link: 'شوف التوثيق →',
    footer_built: 'مبني لحماية المدنيين', footer_year: 'فورست لابس · ٢٠٢٦',
  },
} as const

type Lang = keyof typeof LANG
type LangKey = keyof typeof LANG['en']

// ─── Constants ────────────────────────────────────────────────────────────────

const LOCATIONS = [
  { name: 'Beirut', coords: '33.8938°N 35.5018°E' },
  { name: 'Tyre', coords: '33.2705°N 35.2038°E' },
  { name: 'Nabatieh', coords: '33.3772°N 35.4836°E' },
  { name: 'Baalbek', coords: '34.0044°N 36.2110°E' },
  { name: 'Sidon', coords: '33.5631°N 35.3714°E' },
]

interface StatsData {
  reports_today: number
  confirmed_incidents: number
  active_warnings: number
  total_reports: number
}

interface CanvasNode {
  x: number
  y: number
  vx: number
  vy: number
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function HomePage() {
  const [lang, setLang] = useState<Lang>('en')
  const [stats, setStats] = useState<StatsData>({ reports_today: 0, confirmed_incidents: 0, active_warnings: 0, total_reports: 0 })
  const [displayStats, setDisplayStats] = useState({ reports_today: 0, confirmed_incidents: 0, active_warnings: 0 })
  const [statsLoaded, setStatsLoaded] = useState(false)
  const [locationIdx, setLocationIdx] = useState(0)
  const [locationFade, setLocationFade] = useState(true)
  const [isMobile, setIsMobile] = useState(false)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const nodesRef = useRef<CanvasNode[]>([])
  const animFrameRef = useRef<number>(0)

  const t = useCallback((key: LangKey): string => LANG[lang][key], [lang])

  // ── Number animation ────────────────────────────────────────────────────

  const animateNumber = useCallback((from: number, to: number, duration: number, onUpdate: (n: number) => void) => {
    const start = performance.now()
    function step(now: number) {
      const progress = Math.min((now - start) / duration, 1)
      const eased = 1 - Math.pow(1 - progress, 3)
      onUpdate(Math.round(from + (to - from) * eased))
      if (progress < 1) requestAnimationFrame(step)
    }
    requestAnimationFrame(step)
  }, [])

  // ── Fetch stats ─────────────────────────────────────────────────────────

  const fetchStats = useCallback(async () => {
    try {
      const res = await fetch('/api/stats')
      if (!res.ok) return
      const data = (await res.json()) as StatsData
      setStats(data)
      if (!statsLoaded) {
        setStatsLoaded(true)
        animateNumber(0, data.reports_today, 2000, (n) => setDisplayStats((p) => ({ ...p, reports_today: n })))
        animateNumber(0, data.confirmed_incidents, 2000, (n) => setDisplayStats((p) => ({ ...p, confirmed_incidents: n })))
        animateNumber(0, data.active_warnings, 2000, (n) => setDisplayStats((p) => ({ ...p, active_warnings: n })))
      } else {
        setDisplayStats({ reports_today: data.reports_today, confirmed_incidents: data.confirmed_incidents, active_warnings: data.active_warnings })
      }
    } catch { /* ignore */ }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [animateNumber, statsLoaded])

  // ── Init ────────────────────────────────────────────────────────────────

  useEffect(() => {
    try {
      const saved = localStorage.getItem('fl_lang')
      if (saved === 'ar' || saved === 'fr') setLang(saved)
    } catch { /* ignore */ }
    setIsMobile(window.innerWidth < 600)
    const onResize = () => setIsMobile(window.innerWidth < 600)
    window.addEventListener('resize', onResize)
    fetchStats()
    return () => window.removeEventListener('resize', onResize)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ── Periodic stats refresh ──────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(fetchStats, 30000)
    return () => clearInterval(interval)
  }, [fetchStats])

  // ── Location cycling ────────────────────────────────────────────────────

  useEffect(() => {
    const interval = setInterval(() => {
      setLocationFade(false)
      setTimeout(() => {
        setLocationIdx((i) => (i + 1) % LOCATIONS.length)
        setLocationFade(true)
      }, 300)
    }, 4000)
    return () => clearInterval(interval)
  }, [])

  // ── Canvas animation ────────────────────────────────────────────────────

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const resize = () => {
      canvas.width = window.innerWidth
      canvas.height = window.innerHeight
    }
    resize()
    window.addEventListener('resize', resize)

    // Init nodes
    if (nodesRef.current.length === 0) {
      nodesRef.current = Array.from({ length: 35 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        vx: (Math.random() - 0.5) * 0.6,
        vy: (Math.random() - 0.5) * 0.6,
      }))
    }

    let gridOffset = 0

    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)

      // Grid
      gridOffset = (gridOffset + 0.1) % 40
      ctx.strokeStyle = 'rgba(239,68,68,0.04)'
      ctx.lineWidth = 0.5
      ctx.beginPath()
      for (let x = -40 + gridOffset; x < canvas.width + 40; x += 40) {
        ctx.moveTo(x, 0)
        ctx.lineTo(x, canvas.height)
      }
      for (let y = -40 + gridOffset; y < canvas.height + 40; y += 40) {
        ctx.moveTo(0, y)
        ctx.lineTo(canvas.width, y)
      }
      ctx.stroke()

      // Nodes
      const nodes = nodesRef.current
      for (const node of nodes) {
        node.x += node.vx
        node.y += node.vy
        if (node.x < 0 || node.x > canvas.width) node.vx *= -1
        if (node.y < 0 || node.y > canvas.height) node.vy *= -1
      }

      // Connections
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = nodes[i].x - nodes[j].x
          const dy = nodes[i].y - nodes[j].y
          const dist = Math.sqrt(dx * dx + dy * dy)
          if (dist < 180) {
            const opacity = (1 - dist / 180) * 0.15
            ctx.strokeStyle = `rgba(239,68,68,${opacity})`
            ctx.lineWidth = 0.5
            ctx.beginPath()
            ctx.moveTo(nodes[i].x, nodes[i].y)
            ctx.lineTo(nodes[j].x, nodes[j].y)
            ctx.stroke()
          }
        }
      }

      // Draw nodes
      ctx.fillStyle = 'rgba(239,68,68,0.4)'
      for (const node of nodes) {
        ctx.beginPath()
        ctx.arc(node.x, node.y, 1.5, 0, Math.PI * 2)
        ctx.fill()
      }

      // Scan line
      const scanY = ((Date.now() % 8000) / 8000) * (canvas.height + 200) - 200
      const gradient = ctx.createLinearGradient(0, scanY, 0, scanY + 200)
      gradient.addColorStop(0, 'rgba(239,68,68,0)')
      gradient.addColorStop(0.5, 'rgba(239,68,68,0.03)')
      gradient.addColorStop(1, 'rgba(239,68,68,0)')
      ctx.fillStyle = gradient
      ctx.fillRect(0, scanY, canvas.width, 200)

      animFrameRef.current = requestAnimationFrame(draw)
    }

    animFrameRef.current = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(animFrameRef.current)
      window.removeEventListener('resize', resize)
    }
  }, [])

  // ── Language change handler ─────────────────────────────────────────────

  const changeLang = useCallback((l: Lang) => {
    setLang(l)
    localStorage.setItem('fl_lang', l)
  }, [])

  // ── Render ──────────────────────────────────────────────────────────────

  const loc = LOCATIONS[locationIdx]
  const isRtl = lang === 'ar'

  const sectionLabel = (text: string) => (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 64, justifyContent: 'center' }}>
      <span style={{ flex: 1, height: 1, background: 'rgba(239,68,68,0.15)', maxWidth: 120 }} />
      <span style={{ fontSize: 11, color: 'rgba(239,68,68,0.6)', letterSpacing: '0.25em', fontFamily: 'monospace' }}>{text}</span>
      <span style={{ flex: 1, height: 1, background: 'rgba(239,68,68,0.15)', maxWidth: 120 }} />
    </div>
  )

  const cornerAccent = (pos: 'tl' | 'br', color = 'rgba(239,68,68,0.5)') => (
    <span style={{
      position: 'absolute',
      ...(pos === 'tl' ? { top: 0, left: 0, borderTop: `1px solid ${color}`, borderLeft: `1px solid ${color}` } : { bottom: 0, right: 0, borderBottom: `1px solid ${color}`, borderRight: `1px solid ${color}` }),
      width: 20, height: 20, pointerEvents: 'none',
    }} />
  )

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ background: '#060608', minHeight: '100vh', position: 'relative', overflowX: 'hidden', color: '#ffffff', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <style>{`
        @keyframes pulse-dot { 0%,100%{opacity:1;transform:scale(1)} 50%{opacity:0.4;transform:scale(0.85)} }
        @keyframes pulse-ring { 0%{transform:scale(1);opacity:0.6} 100%{transform:scale(2.5);opacity:0} }
        @keyframes flicker { 0%,100%{opacity:1} 92%{opacity:1} 93%{opacity:0.8} 94%{opacity:1} 96%{opacity:0.9} 97%{opacity:1} }
        @keyframes glow-pulse { 0%,100%{text-shadow:0 0 20px rgba(239,68,68,0.4),0 0 40px rgba(239,68,68,0.2)} 50%{text-shadow:0 0 40px rgba(239,68,68,0.7),0 0 80px rgba(239,68,68,0.3),0 0 120px rgba(239,68,68,0.1)} }
        @keyframes counter-flash { 0%{color:#fff} 50%{color:#ef4444} 100%{color:#fff} }
        @keyframes bounce-chevron { 0%,100%{transform:translateY(0);opacity:0.3} 50%{transform:translateY(8px);opacity:0.6} }
        @keyframes fade-up { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        @keyframes blink-cursor { 0%,100%{opacity:0} 50%{opacity:1} }
        .stat-flash { animation: counter-flash 0.3s ease; }
        @media(max-width:600px){
          .hp-stats-grid{grid-template-columns:1fr 1fr !important}
          .hp-cta-row{flex-direction:column !important}
          .hp-cta-row>a{width:100% !important;justify-content:center !important}
          .hp-steps-row{flex-direction:column !important}
          .hp-steps-divider{display:none !important}
          .hp-two-col{flex-direction:column !important}
          .hp-privacy-row{flex-direction:column !important}
          .hp-org-row{flex-direction:column !important}
          .hp-nav-links{display:none !important}
          .hp-footer-inner{flex-direction:column !important;text-align:center !important}
        }
      `}</style>

      {/* Canvas background */}
      <canvas ref={canvasRef} style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', zIndex: 0, pointerEvents: 'none' }} />

      {/* CRT scanline overlay */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 1, pointerEvents: 'none', background: 'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.03) 2px,rgba(0,0,0,0.03) 4px)' }} />

      {/* ── NAV ──────────────────────────────────────────────────────────── */}
      <nav style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        background: 'rgba(6,6,8,0.85)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(239,68,68,0.2)',
        boxShadow: '0 1px 0 0 rgba(239,68,68,0.1), 0 4px 20px -4px rgba(239,68,68,0.15)',
        padding: '0 24px', height: 52, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <svg width="16" height="16" viewBox="0 0 16 16">
            <circle cx="8" cy="8" r="6" stroke="#ef4444" strokeWidth="1" fill="none" />
            <circle cx="8" cy="8" r="2" fill="#ef4444" />
            <line x1="8" y1="1" x2="8" y2="4" stroke="#ef4444" strokeWidth="1" />
            <line x1="8" y1="12" x2="8" y2="15" stroke="#ef4444" strokeWidth="1" />
            <line x1="1" y1="8" x2="4" y2="8" stroke="#ef4444" strokeWidth="1" />
            <line x1="12" y1="8" x2="15" y2="8" stroke="#ef4444" strokeWidth="1" />
          </svg>
          <span style={{ fontSize: 12, color: '#ef4444', letterSpacing: '0.25em', fontWeight: 600, fontFamily: 'monospace', animation: 'flicker 8s infinite' }}>FORREST LABS</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {/* Language switcher */}
          {(['en', 'fr', 'ar'] as Lang[]).map((l) => (
            <button key={l} type="button" onClick={() => changeLang(l)} style={{
              height: 28, padding: '0 10px', fontSize: 11, fontFamily: 'monospace', letterSpacing: '0.08em',
              borderRadius: 4, cursor: 'pointer',
              background: lang === l ? 'rgba(239,68,68,0.15)' : 'transparent',
              border: lang === l ? '1px solid rgba(239,68,68,0.5)' : '1px solid rgba(255,255,255,0.08)',
              color: lang === l ? '#ef4444' : 'rgba(255,255,255,0.3)',
            }}>{l.toUpperCase()}</button>
          ))}
          <div className="hp-nav-links" style={{ display: 'flex', alignItems: 'center', gap: 12, marginLeft: 8 }}>
            <a href="/map" style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textDecoration: 'none', fontFamily: 'monospace' }}>{t('nav_map')}</a>
            <a href="/report" style={{ fontSize: 13, fontWeight: 500, color: '#ffffff', background: '#ef4444', padding: '7px 16px', borderRadius: 6, textDecoration: 'none', fontFamily: 'monospace' }}>{t('nav_report')} →</a>
          </div>
        </div>
      </nav>

      {/* ── HERO ─────────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 2, minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '80px 24px 60px', textAlign: 'center' }}>

        {/* System status bar */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ position: 'relative', width: 12, height: 12 }}>
              <span style={{ position: 'absolute', top: 2, left: 2, width: 8, height: 8, borderRadius: '50%', background: '#ef4444', animation: 'pulse-dot 1.4s ease-in-out infinite' }} />
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', border: '1px solid #ef4444', animation: 'pulse-ring 1.4s ease-out infinite' }} />
            </div>
            <span style={{ fontSize: 11, color: '#ef4444', letterSpacing: '0.2em', fontFamily: 'monospace' }}>{t('live_badge')}</span>
          </div>
          <span style={{ width: 1, height: 16, background: 'rgba(255,255,255,0.1)' }} />
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontFamily: 'monospace', letterSpacing: '0.05em' }}>{t('live_sub')}</span>
          <span style={{ width: 6, height: 12, background: '#ef4444', animation: 'blink-cursor 0.8s steps(1) infinite' }} />
        </div>

        {/* Coordinate cycling */}
        <div style={{ fontSize: 11, color: 'rgba(239,68,68,0.5)', fontFamily: 'monospace', letterSpacing: '0.1em', marginBottom: 28, opacity: locationFade ? 1 : 0, transition: 'opacity 0.3s ease' }}>
          {loc.name.toUpperCase()} — {loc.coords}
        </div>

        {/* Headline */}
        <h1 style={{ fontSize: 'clamp(36px, 6vw, 64px)', fontWeight: 500, lineHeight: 1.1, letterSpacing: '-0.02em', marginBottom: 24, maxWidth: 800, margin: '0 0 24px 0' }}>
          <span style={{ display: 'block', color: 'rgba(255,255,255,0.7)', animation: 'fade-up 0.8s ease forwards' }}>{t('headline_1')}</span>
          <span style={{ display: 'block', color: '#ffffff', animation: 'fade-up 0.8s 0.15s ease both, glow-pulse 4s ease-in-out infinite' }}>{t('headline_2')}</span>
        </h1>

        {/* Subheadline */}
        <p style={{ fontSize: 'clamp(15px, 2vw, 18px)', color: 'rgba(255,255,255,0.45)', lineHeight: 1.8, maxWidth: 520, margin: '0 auto 40px', letterSpacing: '0.01em', animation: 'fade-up 0.8s 0.3s ease both' }}>
          {t('sub')}
        </p>

        {/* Stats grid */}
        <div className="hp-stats-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 44, maxWidth: 680, width: '100%', animation: 'fade-up 0.8s 0.45s ease both' }}>
          {([
            { key: 'reports_today' as const, label: t('stat_reports'), accent: null },
            { key: 'confirmed_incidents' as const, label: t('stat_confirmed'), accent: 'red' as const },
            { key: 'active_warnings' as const, label: t('stat_warnings'), accent: 'amber' as const },
            { key: null, label: t('stat_uptime'), accent: null },
          ]).map((s, i) => {
            const val = s.key ? displayStats[s.key] : 0
            const isAmber = s.accent === 'amber' && val > 0
            const isRed = s.accent === 'red' && val > 0
            const accentColor = isAmber ? 'rgba(249,115,22,' : isRed ? 'rgba(239,68,68,' : null
            return (
              <div key={i} style={{
                background: accentColor ? `${accentColor}0.04)` : 'rgba(239,68,68,0.04)',
                border: `1px solid ${accentColor ? `${accentColor}0.2)` : 'rgba(239,68,68,0.12)'}`,
                borderRadius: 8, padding: '16px 20px', position: 'relative', overflow: 'hidden',
              }}>
                {cornerAccent('tl', accentColor ? `${accentColor}0.5)` : undefined)}
                {cornerAccent('br', accentColor ? `${accentColor}0.5)` : undefined)}
                <div style={{ fontSize: 32, fontWeight: 500, color: isAmber ? '#f97316' : isRed ? '#ef4444' : '#ffffff', fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em', fontFamily: 'monospace' }}>
                  {s.key ? val : '99.9%'}
                </div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.1em', textTransform: 'uppercase', marginTop: 4, fontFamily: 'monospace' }}>{s.label}</div>
              </div>
            )
          })}
        </div>

        {/* CTA buttons */}
        <div className="hp-cta-row" style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', animation: 'fade-up 0.8s 0.6s ease both' }}>
          <a href="/report" style={{ position: 'relative', overflow: 'hidden', background: '#ef4444', color: '#ffffff', height: 52, padding: '0 32px', borderRadius: 6, fontSize: 15, fontWeight: 500, letterSpacing: '0.02em', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}>
            {t('cta_primary')} →
          </a>
          <a href="/map" style={{ background: 'transparent', border: '1px solid rgba(255,255,255,0.15)', color: 'rgba(255,255,255,0.6)', height: 52, padding: '0 28px', borderRadius: 6, fontSize: 15, textDecoration: 'none', display: 'flex', alignItems: 'center', letterSpacing: '0.02em' }}>
            {t('cta_secondary')}
          </a>
        </div>

        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.2)', fontFamily: 'monospace', letterSpacing: '0.05em', marginTop: 16 }}>{t('cta_note')}</p>

        {/* Scroll chevron */}
        <div style={{ marginTop: 48, animation: 'bounce-chevron 2s ease-in-out infinite', fontFamily: 'monospace', fontSize: 18, color: 'rgba(239,68,68,0.4)' }}>↓</div>
      </section>

      {/* ── HOW IT WORKS ─────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 2, padding: '120px 24px', maxWidth: 760, margin: '0 auto' }}>
        {sectionLabel(t('how_label'))}
        <div className="hp-steps-row" style={{ display: 'flex', gap: 40, alignItems: 'flex-start' }}>
          {([
            { num: t('s1_num'), title: t('s1_title'), body: t('s1_body') },
            { num: t('s2_num'), title: t('s2_title'), body: t('s2_body') },
            { num: t('s3_num'), title: t('s3_title'), body: t('s3_body') },
          ]).map((step, i) => (
            <div key={i} style={{ display: 'contents' }}>
              {i > 0 && <div className="hp-steps-divider" style={{ width: 1, background: 'linear-gradient(to bottom, rgba(239,68,68,0), rgba(239,68,68,0.3), rgba(239,68,68,0))', height: 80, alignSelf: 'center', flexShrink: 0 }} />}
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: 'monospace', fontSize: 11, color: 'rgba(239,68,68,0.5)', letterSpacing: '0.15em', marginBottom: 12 }}>{step.num}</div>
                <div style={{ fontSize: 19, color: '#ffffff', fontWeight: 500, marginBottom: 10 }}>{step.title}</div>
                <div style={{ fontSize: 15, color: 'rgba(255,255,255,0.4)', lineHeight: 1.8 }}>{step.body}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── WHAT YOU CAN REPORT ──────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 2, padding: '80px 24px', background: 'rgba(239,68,68,0.025)', borderTop: '1px solid rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          {sectionLabel(t('report_label'))}
          <div className="hp-two-col" style={{ display: 'flex', gap: 24 }}>
            {/* Strikes card */}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 28, position: 'relative', overflow: 'hidden' }}>
              {cornerAccent('tl')}
              {cornerAccent('br')}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
                <span style={{ fontSize: 16, color: '#ef4444', fontWeight: 500 }}>{t('strikes_title')}</span>
              </div>
              {[t('strike_1'), t('strike_2'), t('strike_3'), t('strike_4')].map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#ef4444' }}>&gt;</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>{item}</span>
                </div>
              ))}
            </div>
            {/* Warnings card */}
            <div style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: 10, padding: 28, position: 'relative', overflow: 'hidden' }}>
              {cornerAccent('tl', 'rgba(249,115,22,0.5)')}
              {cornerAccent('br', 'rgba(249,115,22,0.5)')}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
                <span style={{ fontSize: 16, color: '#f97316', fontWeight: 500 }}>{t('warnings_title')}</span>
              </div>
              {[t('warn_1'), t('warn_2'), t('warn_3'), t('warn_4')].map((item) => (
                <div key={item} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                  <span style={{ fontFamily: 'monospace', fontSize: 11, color: '#f97316' }}>!</span>
                  <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.55)' }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── PRIVACY ──────────────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 2, padding: '100px 24px', maxWidth: 760, margin: '0 auto' }}>
        {sectionLabel(t('privacy_label'))}
        <div className="hp-privacy-row" style={{ display: 'flex', gap: 20 }}>
          {([
            { title: t('p1_title'), body: t('p1_body'), icon: <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><rect x="4" y="8" width="10" height="8" rx="2" stroke="#ef4444" strokeWidth="1.5" /><path d="M6 8V5C6 3.34 7.34 2 9 2C10.66 2 12 3.34 12 5V8" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" /></svg> },
            { title: t('p2_title'), body: t('p2_body'), icon: <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><circle cx="9" cy="9" r="3" stroke="#ef4444" strokeWidth="1.5" /><path d="M1 9C3 5 6 3 9 3C12 3 15 5 17 9C15 13 12 15 9 15C6 15 3 13 1 9Z" stroke="#ef4444" strokeWidth="1.5" /><line x1="2" y1="16" x2="16" y2="2" stroke="#ef4444" strokeWidth="1.5" strokeLinecap="round" /></svg> },
            { title: t('p3_title'), body: t('p3_body'), icon: <svg width="16" height="16" viewBox="0 0 18 18" fill="none"><path d="M9 1L2 5V9C2 13.4 5 16.5 9 17.5C13 16.5 16 13.4 16 9V5L9 1Z" stroke="#ef4444" strokeWidth="1.5" strokeLinejoin="round" /></svg> },
          ]).map((item) => (
            <div key={item.title} style={{ flex: 1, padding: 24, border: '1px solid rgba(255,255,255,0.04)', borderRadius: 8, position: 'relative', transition: 'all 0.2s ease' }}>
              <div style={{ width: 36, height: 36, background: 'rgba(239,68,68,0.08)', borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 16 }}>
                {item.icon}
              </div>
              <div style={{ fontSize: 15, color: '#ffffff', fontWeight: 500, marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7 }}>{item.body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FOR ORGANISATIONS ────────────────────────────────────────────── */}
      <section style={{ position: 'relative', zIndex: 2, padding: '80px 24px', background: 'rgba(239,68,68,0.025)', borderTop: '1px solid rgba(239,68,68,0.08)', borderBottom: '1px solid rgba(239,68,68,0.08)' }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
        {sectionLabel(t('org_label'))}
        <div className="hp-org-row" style={{ display: 'flex', gap: 16 }}>
          {([
            { title: t('org_dash_title'), body: t('org_dash_body'), link: t('org_dash_link'), href: 'mailto:hello@forrestlabs.org?subject=Forrest Labs partner access' },
            { title: t('org_export_title'), body: t('org_export_body'), link: t('org_export_link'), href: '/api/events', target: '_blank' },
            { title: t('org_api_title'), body: t('org_api_body'), link: t('org_api_link'), href: '/api/brief', target: '_blank' },
          ] as const).map((item) => (
            <div key={item.title} style={{ flex: 1, background: 'rgba(255,255,255,0.02)', border: '0.5px solid rgba(255,255,255,0.08)', borderRadius: 8, padding: 20 }}>
              <div style={{ fontSize: 15, color: '#ffffff', fontWeight: 500, marginBottom: 8 }}>{item.title}</div>
              <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.4)', lineHeight: 1.7, marginBottom: 12 }}>{item.body}</div>
              <a href={item.href} target={'target' in item ? item.target : undefined} rel={'target' in item ? 'noopener noreferrer' : undefined} style={{ fontSize: 13, color: '#f85149', textDecoration: 'none' }}>{item.link}</a>
            </div>
          ))}
        </div>
        </div>
      </section>

      {/* ── FOOTER ───────────────────────────────────────────────────────── */}
      <footer style={{ position: 'relative', zIndex: 2, padding: '40px 24px', borderTop: '1px solid rgba(239,68,68,0.08)' }}>
        <div className="hp-footer-inner" style={{ maxWidth: 760, margin: '0 auto', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12, fontFamily: 'monospace', fontSize: 12, color: 'rgba(255,255,255,0.2)' }}>
          <span>&gt; FORREST-LABS-v1.0.0</span>
          <span>{t('footer_built')}</span>
          <div style={{ display: 'flex', gap: 16 }}>
            <a href="/report" style={{ color: '#ef4444', textDecoration: 'none', fontFamily: 'monospace', fontSize: 12 }}>{t('nav_report')} →</a>
            <a href="/map" style={{ color: 'rgba(255,255,255,0.3)', textDecoration: 'none', fontFamily: 'monospace', fontSize: 12 }}>{t('nav_map')}</a>
          </div>
        </div>
      </footer>
    </div>
  )
}
