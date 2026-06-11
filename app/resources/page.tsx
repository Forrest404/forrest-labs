'use client'

import { useEffect, useState } from 'react'

// Public emergency-resources page: Lebanon's standard emergency numbers (one-tap call),
// brief safety guidance, and links into the live map / report form. Static + low-bandwidth;
// trilingual (EN/FR/AR + RTL), shares the site-wide 'fl_lang' preference. No data collected.

type Lang = 'en' | 'fr' | 'ar'

// Canonical Lebanese emergency numbers (cross-referenced against the Lebanese National News
// Agency and other authoritative listings).
const HOTLINES: { tel: string; key: string }[] = [
  { tel: '140', key: 'red_cross' },       // Lebanese Red Cross — ambulance
  { tel: '125', key: 'civil_defence' },   // Civil Defence — rescue / fire / disasters
  { tel: '112', key: 'police' },          // Internal Security Forces — police
  { tel: '175', key: 'fire' },            // Fire Brigade
  { tel: '1701', key: 'army' },           // Lebanese Army
  { tel: '1717', key: 'general_security' }, // General Security
]

// Support / crisis helplines (emotional support, child protection, LGBTQIA+). These carry
// hours + a short description, so they render as richer cards below the emergency numbers.
const HELPLINES: { tel: string; key: string }[] = [
  { tel: '1564', key: 'embrace' },          // Embrace Lifeline
  { tel: '+9611611611', key: 'cypp' },      // Child & Youth Protection Program
  { tel: '+96171916146', key: 'helem' },    // Helem LGBTQIA+ support line
]

const S: Record<Lang, Record<string, string>> = {
  en: {
    title: 'Emergency resources', sub: 'If you are in immediate danger, call now.',
    back: '← Home', call_now: 'Call for help now', tap_to_call: 'Tap to call',
    red_cross: 'Lebanese Red Cross — ambulance', civil_defence: 'Civil Defence — rescue & fire',
    police: 'Internal Security Forces — police', fire: 'Fire Brigade',
    army: 'Lebanese Army', general_security: 'General Security',
    helplines_title: 'Support helplines',
    embrace_name: 'Embrace Lifeline — emotional support & suicide prevention', embrace_hours: '24/7 · Arabic, English, French', embrace_desc: 'Lebanon’s national confidential emotional-support and suicide-prevention helpline.',
    cypp_name: 'Child & Youth Protection — youth helpline', cypp_hours: 'Mon–Fri, 9 AM–6 PM', cypp_desc: 'Emotional support for children and adolescents in distress.',
    helem_name: 'Helem — LGBTQIA+ support line', helem_hours: 'Daily, 5 PM–9 PM', helem_desc: 'Crisis support and mental-health services for LGBTQIA+ people.',
    guidance_title: 'If there is a strike or evacuation order',
    g1: 'Move away from the area and from windows; get to the lowest, most sheltered floor.',
    g2: 'Follow official evacuation orders immediately — do not wait for confirmation.',
    g3: 'Keep your phone charged; share your location with someone you trust.',
    g4: 'Avoid damaged buildings, downed wires, and unexploded ordnance — keep clear and report it.',
    informed_title: 'Stay informed', view_map: 'Live map of verified incidents & warnings',
    report: 'Report a strike or warning', map_desc: 'See what has been verified near you in real time.',
    report_desc: 'Anonymous · no account · helps aid teams find where help is needed.',
    disclaimer: 'These are general Lebanese emergency numbers. In a life-threatening emergency, call immediately — this tool is not a substitute for emergency services. Numbers may vary by area; if one does not connect, try another.',
  },
  fr: {
    title: 'Ressources d’urgence', sub: 'Si vous êtes en danger immédiat, appelez maintenant.',
    back: '← Accueil', call_now: 'Appeler à l’aide maintenant', tap_to_call: 'Appuyez pour appeler',
    red_cross: 'Croix-Rouge libanaise — ambulance', civil_defence: 'Défense civile — secours & incendie',
    police: 'Forces de sécurité intérieure — police', fire: 'Brigade des pompiers',
    army: 'Armée libanaise', general_security: 'Sûreté générale',
    helplines_title: 'Lignes d’écoute',
    embrace_name: 'Embrace Lifeline — soutien émotionnel & prévention du suicide', embrace_hours: '24h/24 7j/7 · arabe, anglais, français', embrace_desc: 'Ligne nationale et confidentielle de soutien émotionnel et de prévention du suicide.',
    cypp_name: 'Protection de l’enfance et de la jeunesse — ligne jeunes', cypp_hours: 'Lun–Ven, 9h–18h', cypp_desc: 'Soutien émotionnel pour les enfants et adolescents en détresse.',
    helem_name: 'Helem — ligne de soutien LGBTQIA+', helem_hours: 'Tous les jours, 17h–21h', helem_desc: 'Soutien de crise et services de santé mentale pour les personnes LGBTQIA+.',
    guidance_title: 'En cas de frappe ou d’ordre d’évacuation',
    g1: 'Éloignez-vous de la zone et des fenêtres ; gagnez l’étage le plus bas et le plus abrité.',
    g2: 'Suivez immédiatement les ordres d’évacuation officiels — n’attendez pas de confirmation.',
    g3: 'Gardez votre téléphone chargé ; partagez votre position avec une personne de confiance.',
    g4: 'Évitez les bâtiments endommagés, les câbles tombés et les engins non explosés — restez à l’écart et signalez-les.',
    informed_title: 'Restez informé', view_map: 'Carte en direct des incidents & avertissements vérifiés',
    report: 'Signaler une frappe ou un avertissement', map_desc: 'Voyez ce qui a été vérifié près de vous en temps réel.',
    report_desc: 'Anonyme · sans compte · aide les équipes de secours à localiser les besoins.',
    disclaimer: 'Ce sont des numéros d’urgence libanais généraux. En cas d’urgence vitale, appelez immédiatement — cet outil ne remplace pas les services d’urgence. Les numéros peuvent varier selon la région ; si l’un ne répond pas, essayez-en un autre.',
  },
  ar: {
    title: 'موارد الطوارئ', sub: 'إذا كنت في خطر مباشر، اتصل الآن.',
    back: '← الرئيسية', call_now: 'اتصل للمساعدة الآن', tap_to_call: 'اضغط للاتصال',
    red_cross: 'الصليب الأحمر اللبناني — إسعاف', civil_defence: 'الدفاع المدني — إنقاذ وإطفاء',
    police: 'قوى الأمن الداخلي — الشرطة', fire: 'فوج الإطفاء',
    army: 'الجيش اللبناني', general_security: 'الأمن العام',
    helplines_title: 'خطوط الدعم',
    embrace_name: 'Embrace Lifeline — دعم نفسي والوقاية من الانتحار', embrace_hours: '٢٤/٧ · العربية والإنجليزية والفرنسية', embrace_desc: 'الخط الوطني السري للدعم النفسي والوقاية من الانتحار في لبنان.',
    cypp_name: 'حماية الطفل والشباب — خط مساندة الشباب', cypp_hours: 'الإثنين–الجمعة، ٩ ص–٦ م', cypp_desc: 'دعم نفسي للأطفال والمراهقين في حالات الضيق.',
    helem_name: 'حلم — خط دعم مجتمع الميم', helem_hours: 'يومياً، ٥ م–٩ م', helem_desc: 'دعم في الأزمات وخدمات صحة نفسية لأفراد مجتمع الميم.',
    guidance_title: 'عند وقوع ضربة أو أمر إخلاء',
    g1: 'ابتعد عن المنطقة وعن النوافذ، وانتقل إلى أدنى طابق وأكثره حماية.',
    g2: 'اتبع أوامر الإخلاء الرسمية فوراً — لا تنتظر التأكيد.',
    g3: 'أبقِ هاتفك مشحوناً، وشارك موقعك مع شخص تثق به.',
    g4: 'تجنّب المباني المتضررة والأسلاك المتساقطة والذخائر غير المنفجرة — ابتعد عنها وأبلغ عنها.',
    informed_title: 'ابقَ على اطلاع', view_map: 'خريطة حية للحوادث والتحذيرات المؤكدة',
    report: 'الإبلاغ عن ضربة أو تحذير', map_desc: 'شاهد ما تم التحقق منه قربك في الوقت الفعلي.',
    report_desc: 'مجهول · بدون حساب · يساعد فرق الإغاثة على معرفة أماكن الحاجة.',
    disclaimer: 'هذه أرقام طوارئ لبنانية عامة. في حالة الخطر على الحياة اتصل فوراً — هذه الأداة ليست بديلاً عن خدمات الطوارئ. قد تختلف الأرقام حسب المنطقة؛ إذا لم يتصل أحدها، جرّب آخر.',
  },
}

export default function ResourcesPage() {
  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => {
    try { const s = localStorage.getItem('fl_lang'); if (s === 'en' || s === 'fr' || s === 'ar') setLang(s) } catch { /* storage off */ }
  }, [])
  const changeLang = (l: Lang) => { setLang(l); try { localStorage.setItem('fl_lang', l) } catch { /* storage off */ } }
  const t = (k: string) => S[lang]?.[k] ?? S.en[k] ?? k
  const isRtl = lang === 'ar'

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e6edf3', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 48px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 18 }}>
          <a href="/" style={{ color: '#8b949e', textDecoration: 'none', fontSize: 14 }}>{t('back')}</a>
          <div style={{ display: 'flex', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, overflow: 'hidden' }}>
            {(['en', 'fr', 'ar'] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => changeLang(l)} aria-pressed={lang === l}
                style={{ background: lang === l ? 'rgba(239,68,68,0.25)' : 'transparent', color: lang === l ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer', fontFamily: 'system-ui', fontSize: 12, fontWeight: 600, padding: '6px 10px' }}>
                {l === 'ar' ? 'ع' : l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 4px' }}>{t('title')}</h1>
        <p style={{ fontSize: 15, color: '#f87171', margin: '0 0 22px', fontWeight: 600 }}>{t('sub')}</p>

        {/* Call now */}
        <div style={{ fontSize: 12, color: '#8b949e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{t('call_now')}</div>
        <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
          {HOTLINES.map((h) => (
            <a key={h.tel} href={`tel:${h.tel}`} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#161b22', border: '1px solid rgba(248,81,73,0.4)', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: '#e6edf3' }}>
              <span style={{ minWidth: 0 }}>
                <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{t(h.key)}</span>
                <span style={{ display: 'block', fontSize: 12, color: '#8b949e', marginTop: 2 }}>{t('tap_to_call')}</span>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                <span style={{ fontSize: 22, fontWeight: 800, color: '#f85149', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{h.tel}</span>
                <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden>
                  <path d="M5 3.5c0-.6.5-1 1-1h2.2c.5 0 .9.3 1 .8l.7 3a1 1 0 0 1-.3 1l-1.4 1.3a11 11 0 0 0 4.7 4.7l1.3-1.4a1 1 0 0 1 1-.3l3 .7c.5.1.8.5.8 1V17c0 .5-.4 1-1 1A13 13 0 0 1 5 5.2V3.5Z" fill="#3fb950" />
                </svg>
              </span>
            </a>
          ))}
        </div>

        {/* Support helplines */}
        <div style={{ fontSize: 12, color: '#8b949e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{t('helplines_title')}</div>
        <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
          {HELPLINES.map((h) => (
            <a key={h.tel} href={`tel:${h.tel}`} style={{ display: 'block', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: '#e6edf3' }}>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 600 }}>{t(`${h.key}_name`)}</span>
              <span style={{ display: 'block', fontSize: 13, color: '#8b949e', margin: '4px 0 8px', lineHeight: 1.45 }}>{t(`${h.key}_desc`)}</span>
              <span style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10 }}>
                <span style={{ fontSize: 12, color: '#6e7681' }}>{t(`${h.key}_hours`)}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#58a6ff', fontWeight: 700, fontSize: 15, direction: 'ltr' }}>
                  {h.tel}
                  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden>
                    <path d="M5 3.5c0-.6.5-1 1-1h2.2c.5 0 .9.3 1 .8l.7 3a1 1 0 0 1-.3 1l-1.4 1.3a11 11 0 0 0 4.7 4.7l1.3-1.4a1 1 0 0 1 1-.3l3 .7c.5.1.8.5.8 1V17c0 .5-.4 1-1 1A13 13 0 0 1 5 5.2V3.5Z" fill="#3fb950" />
                  </svg>
                </span>
              </span>
            </a>
          ))}
        </div>

        {/* Guidance */}
        <div style={{ fontSize: 12, color: '#8b949e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{t('guidance_title')}</div>
        <ul style={{ margin: '0 0 28px', padding: isRtl ? '0 18px 0 0' : '0 0 0 18px', display: 'grid', gap: 8 }}>
          {['g1', 'g2', 'g3', 'g4'].map((g) => (
            <li key={g} style={{ fontSize: 14, color: '#c9d1d9', lineHeight: 1.5 }}>{t(g)}</li>
          ))}
        </ul>

        {/* Stay informed */}
        <div style={{ fontSize: 12, color: '#8b949e', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 10 }}>{t('informed_title')}</div>
        <div style={{ display: 'grid', gap: 10, marginBottom: 28 }}>
          <a href="/map" style={{ display: 'block', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: '#e6edf3' }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: '#58a6ff' }}>{t('view_map')} →</span>
            <span style={{ display: 'block', fontSize: 12, color: '#8b949e', marginTop: 3 }}>{t('map_desc')}</span>
          </a>
          <a href="/report" style={{ display: 'block', background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: '14px 16px', textDecoration: 'none', color: '#e6edf3' }}>
            <span style={{ display: 'block', fontSize: 15, fontWeight: 600, color: '#f85149' }}>{t('report')} →</span>
            <span style={{ display: 'block', fontSize: 12, color: '#8b949e', marginTop: 3 }}>{t('report_desc')}</span>
          </a>
        </div>

        <p style={{ fontSize: 12, color: '#6e7681', lineHeight: 1.5, borderTop: '0.5px solid #21262d', paddingTop: 16, margin: 0 }}>{t('disclaimer')}</p>
      </div>
    </div>
  )
}
