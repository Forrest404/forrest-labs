'use client'

import { useEffect, useState } from 'react'

// Public methodology + FAQ page: explains, in plain language, how civilian reports become
// verified incidents (clustering → confidence → news/official cross-reference), what each map
// colour/status means, and answers common questions. Static + low-bandwidth; trilingual
// (EN/FR/AR + RTL); shares the site-wide 'fl_lang'. No data collected. Content mirrors the
// pipeline + map legend described in the project docs — it does not overclaim accuracy.

type Lang = 'en' | 'fr' | 'ar'

const LEGEND: { color: string; key: string }[] = [
  { color: '#f85149', key: 'l_red' },
  { color: '#d29922', key: 'l_orange' },
  { color: '#58a6ff', key: 'l_blue' },
  { color: '#a371f7', key: 'l_purple' },
  { color: '#8b949e', key: 'l_grey' },
]

const STEPS = ['st1', 'st2', 'st3', 'st4']
const FAQS = ['q1', 'q2', 'q3', 'q4', 'q5', 'q6']

const S: Record<Lang, Record<string, string>> = {
  en: {
    title: 'How verification works', back: '← Home',
    intro: 'Nour turns anonymous civilian reports into verified incidents. No single report is taken as fact — incidents are corroborated and cross-checked before they appear as verified on the map.',
    steps_title: 'The pipeline',
    st1: 'Report — People nearby report what they saw (a strike, shelling, fire, collapse) from any phone. No app, no account.',
    st2: 'Cluster — Reports describing the same event, close in place and time, are grouped automatically into one incident.',
    st3: 'Score & cross-reference — Each incident is given a confidence level and checked against news reports and official sources.',
    st4: 'Publish — Once corroborated, the incident appears on the live map, colour-coded by how it was verified. Uncorroborated reports stay pending and are not shown as verified.',
    legend_title: 'What the colours mean',
    l_red: 'Civilian-confirmed — multiple independent reports corroborate the same incident.',
    l_orange: 'Auto-confirmed — met the automatic confidence threshold from civilian reports.',
    l_blue: 'News-verified — matched to one or more news reports.',
    l_purple: 'Officially verified — confirmed by an official source.',
    l_grey: 'Pending — reported but not yet corroborated; not shown as a verified incident.',
    faq_title: 'Common questions',
    q1: 'Is my report anonymous?', a1: 'Yes. There is no account and no sign-up. We do not ask for your name or number, and identifying data is minimised. See the Privacy page for details.',
    q2: 'How long until my report appears?', a2: 'Reports are processed in batches, not instantly. A report may take some time to be grouped and cross-checked, and it only appears once it is corroborated.',
    q3: 'Why isn’t my report on the map?', a3: 'A single, uncorroborated report stays pending. It appears as a verified incident only once other reports, news, or an official source corroborate it. Some reports are set aside if they cannot be confirmed.',
    q4: 'Can I trust the map?', a4: 'Verified incidents are corroborated and cross-referenced, and the colour shows how. It is a best-effort picture, not a guarantee — always follow official emergency guidance and your own judgement.',
    q5: 'Which areas are covered?', a5: 'Nour currently focuses on Lebanon.',
    q6: 'Does it cost anything or need an app?', a6: 'No. Reporting and the map work in any phone browser, with no app, no account, and no fee.',
    footer_note: 'In a life-threatening emergency, call for help first.',
    privacy: 'Privacy', resources: 'Emergency help', map: 'Live map',
  },
  fr: {
    title: 'Comment fonctionne la vérification', back: '← Accueil',
    intro: 'Nour transforme des signalements anonymes de civils en incidents vérifiés. Aucun signalement isolé n’est pris pour argent comptant — les incidents sont corroborés et recoupés avant d’apparaître comme vérifiés sur la carte.',
    steps_title: 'Le processus',
    st1: 'Signaler — Les personnes à proximité signalent ce qu’elles ont vu (frappe, bombardement, incendie, effondrement) depuis n’importe quel téléphone. Sans app, sans compte.',
    st2: 'Regrouper — Les signalements décrivant le même événement, proches dans l’espace et le temps, sont automatiquement regroupés en un seul incident.',
    st3: 'Évaluer & recouper — Chaque incident reçoit un niveau de confiance et est comparé aux médias et aux sources officielles.',
    st4: 'Publier — Une fois corroboré, l’incident apparaît sur la carte en direct, codé par couleur selon son mode de vérification. Les signalements non corroborés restent en attente et ne sont pas affichés comme vérifiés.',
    legend_title: 'Signification des couleurs',
    l_red: 'Confirmé par des civils — plusieurs signalements indépendants corroborent le même incident.',
    l_orange: 'Auto-confirmé — a atteint le seuil de confiance automatique à partir des signalements.',
    l_blue: 'Vérifié par les médias — correspond à un ou plusieurs articles de presse.',
    l_purple: 'Vérifié officiellement — confirmé par une source officielle.',
    l_grey: 'En attente — signalé mais pas encore corroboré ; non affiché comme incident vérifié.',
    faq_title: 'Questions fréquentes',
    q1: 'Mon signalement est-il anonyme ?', a1: 'Oui. Aucun compte ni inscription. Nous ne demandons ni votre nom ni votre numéro, et les données identifiantes sont réduites au minimum. Voir la page Confidentialité.',
    q2: 'Combien de temps avant que mon signalement apparaisse ?', a2: 'Les signalements sont traités par lots, pas instantanément. Un signalement peut mettre du temps à être regroupé et recoupé, et il n’apparaît qu’une fois corroboré.',
    q3: 'Pourquoi mon signalement n’est-il pas sur la carte ?', a3: 'Un signalement isolé et non corroboré reste en attente. Il n’apparaît comme incident vérifié qu’une fois corroboré par d’autres signalements, les médias ou une source officielle. Certains signalements sont écartés s’ils ne peuvent être confirmés.',
    q4: 'Puis-je faire confiance à la carte ?', a4: 'Les incidents vérifiés sont corroborés et recoupés, et la couleur indique comment. C’est une image au mieux, pas une garantie — suivez toujours les consignes officielles et votre propre jugement.',
    q5: 'Quelles zones sont couvertes ?', a5: 'Nour se concentre actuellement sur le Liban.',
    q6: 'Est-ce payant ou faut-il une app ?', a6: 'Non. Le signalement et la carte fonctionnent dans le navigateur de n’importe quel téléphone, sans app, sans compte et sans frais.',
    footer_note: 'En cas d’urgence vitale, appelez d’abord les secours.',
    privacy: 'Confidentialité', resources: 'Aide d’urgence', map: 'Carte en direct',
  },
  ar: {
    title: 'كيف يعمل التحقّق', back: '← الرئيسية',
    intro: 'يحوّل نور بلاغات المدنيين المجهولة إلى حوادث مؤكدة. لا يُؤخذ أي بلاغ منفرد كحقيقة — تُدعَّم الحوادث وتُقارَن بمصادر أخرى قبل أن تظهر مؤكدة على الخريطة.',
    steps_title: 'سير العمل',
    st1: 'الإبلاغ — يُبلّغ القريبون عمّا رأوه (ضربة، قصف، حريق، انهيار) من أي هاتف. بدون تطبيق وبدون حساب.',
    st2: 'التجميع — تُجمَّع البلاغات التي تصف الحدث نفسه والمتقاربة مكاناً وزماناً تلقائياً في حادثة واحدة.',
    st3: 'التقييم والمقارنة — تُمنح كل حادثة مستوى ثقة وتُقارَن بالأخبار والمصادر الرسمية.',
    st4: 'النشر — بعد التأكيد تظهر الحادثة على الخريطة الحية، ملوّنة حسب طريقة التحقق. تبقى البلاغات غير المؤكدة قيد الانتظار ولا تُعرض كمؤكدة.',
    legend_title: 'معاني الألوان',
    l_red: 'مؤكدة من المدنيين — عدة بلاغات مستقلة تدعم الحادثة نفسها.',
    l_orange: 'مؤكدة تلقائياً — بلغت عتبة الثقة التلقائية من البلاغات.',
    l_blue: 'مؤكدة بالأخبار — مطابِقة لتقرير إخباري أو أكثر.',
    l_purple: 'مؤكدة رسمياً — مؤكَّدة من مصدر رسمي.',
    l_grey: 'قيد الانتظار — مُبلَّغ عنها لكن لم تُدعَّم بعد؛ لا تُعرض كحادثة مؤكدة.',
    faq_title: 'أسئلة شائعة',
    q1: 'هل بلاغي مجهول؟', a1: 'نعم. لا حساب ولا تسجيل. لا نطلب اسمك أو رقمك، والبيانات المعرِّفة مُقلَّصة إلى أدنى حد. راجع صفحة الخصوصية.',
    q2: 'كم يستغرق ظهور بلاغي؟', a2: 'تُعالَج البلاغات على دفعات وليس فوراً. قد يستغرق البلاغ بعض الوقت ليُجمَّع ويُقارَن، ولا يظهر إلا بعد تأكيده.',
    q3: 'لماذا لا يظهر بلاغي على الخريطة؟', a3: 'يبقى البلاغ المنفرد غير المدعوم قيد الانتظار. لا يظهر كحادثة مؤكدة إلا بعد أن تدعمه بلاغات أخرى أو الأخبار أو مصدر رسمي. وتُنحّى بعض البلاغات إذا تعذّر تأكيدها.',
    q4: 'هل يمكنني الوثوق بالخريطة؟', a4: 'الحوادث المؤكدة مدعومة ومُقارَنة، واللون يوضّح كيف. إنها أفضل صورة ممكنة وليست ضماناً — اتبع دائماً التعليمات الرسمية وحكمك الخاص.',
    q5: 'ما المناطق المغطّاة؟', a5: 'يركّز نور حالياً على لبنان.',
    q6: 'هل هناك تكلفة أو حاجة لتطبيق؟', a6: 'لا. الإبلاغ والخريطة يعملان في متصفح أي هاتف، بدون تطبيق وبدون حساب وبدون رسوم.',
    footer_note: 'في حالة الخطر على الحياة، اتصل بالطوارئ أولاً.',
    privacy: 'الخصوصية', resources: 'مساعدة طارئة', map: 'الخريطة الحية',
  },
}

export default function MethodologyPage() {
  const [lang, setLang] = useState<Lang>('en')
  useEffect(() => {
    try { const s = localStorage.getItem('fl_lang'); if (s === 'en' || s === 'fr' || s === 'ar') setLang(s) } catch { /* storage off */ }
  }, [])
  const changeLang = (l: Lang) => { setLang(l); try { localStorage.setItem('fl_lang', l) } catch { /* storage off */ } }
  const t = (k: string) => S[lang]?.[k] ?? S.en[k] ?? k
  const isRtl = lang === 'ar'

  const sectionLabel = { fontSize: 12, color: '#8b949e', letterSpacing: '0.08em', textTransform: 'uppercase' as const, marginBottom: 12 }

  return (
    <div dir={isRtl ? 'rtl' : 'ltr'} style={{ minHeight: '100vh', background: '#0a0a0f', color: '#e6edf3', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ maxWidth: 680, margin: '0 auto', padding: '20px 16px 48px' }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, marginBottom: 18 }}>
          <a href="/" style={{ color: '#8b949e', textDecoration: 'none', fontSize: 14 }}>{t('back')}</a>
          <div style={{ display: 'flex', border: '0.5px solid rgba(255,255,255,0.15)', borderRadius: 8, overflow: 'hidden' }}>
            {(['en', 'fr', 'ar'] as Lang[]).map((l) => (
              <button key={l} type="button" onClick={() => changeLang(l)} aria-pressed={lang === l}
                style={{ background: lang === l ? 'rgba(88,166,255,0.25)' : 'transparent', color: lang === l ? '#fff' : 'rgba(255,255,255,0.6)', border: 'none', cursor: 'pointer', fontFamily: 'system-ui', fontSize: 12, fontWeight: 600, padding: '6px 10px' }}>
                {l === 'ar' ? 'ع' : l.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <h1 style={{ fontSize: 26, fontWeight: 800, margin: '0 0 8px' }}>{t('title')}</h1>
        <p style={{ fontSize: 15, color: '#c9d1d9', lineHeight: 1.6, margin: '0 0 28px' }}>{t('intro')}</p>

        {/* Pipeline steps */}
        <div style={sectionLabel}>{t('steps_title')}</div>
        <ol style={{ listStyle: 'none', counterReset: 'step', margin: '0 0 28px', padding: 0, display: 'grid', gap: 10 }}>
          {STEPS.map((st, i) => (
            <li key={st} style={{ display: 'flex', gap: 12, background: '#161b22', border: '1px solid #21262d', borderRadius: 12, padding: '12px 14px' }}>
              <span style={{ flexShrink: 0, width: 26, height: 26, borderRadius: '50%', background: 'rgba(88,166,255,0.15)', color: '#58a6ff', fontSize: 13, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{i + 1}</span>
              <span style={{ fontSize: 14, color: '#c9d1d9', lineHeight: 1.5 }}>{t(st)}</span>
            </li>
          ))}
        </ol>

        {/* Colour legend */}
        <div style={sectionLabel}>{t('legend_title')}</div>
        <div style={{ display: 'grid', gap: 8, marginBottom: 28 }}>
          {LEGEND.map((item) => (
            <div key={item.key} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
              <span style={{ flexShrink: 0, width: 12, height: 12, borderRadius: '50%', background: item.color, marginTop: 4 }} />
              <span style={{ fontSize: 14, color: '#c9d1d9', lineHeight: 1.5 }}>{t(item.key)}</span>
            </div>
          ))}
        </div>

        {/* FAQ */}
        <div style={sectionLabel}>{t('faq_title')}</div>
        <div style={{ display: 'grid', gap: 14, marginBottom: 28 }}>
          {FAQS.map((q) => (
            <div key={q}>
              <div style={{ fontSize: 15, fontWeight: 600, color: '#e6edf3', marginBottom: 4 }}>{t(q)}</div>
              <div style={{ fontSize: 14, color: '#8b949e', lineHeight: 1.55 }}>{t(q.replace('q', 'a'))}</div>
            </div>
          ))}
        </div>

        <p style={{ fontSize: 13, color: '#f87171', fontWeight: 600, margin: '0 0 14px' }}>{t('footer_note')}</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16, borderTop: '0.5px solid #21262d', paddingTop: 16 }}>
          <a href="/map" style={{ color: '#58a6ff', textDecoration: 'none', fontSize: 13 }}>{t('map')}</a>
          <a href="/resources" style={{ color: '#f85149', textDecoration: 'none', fontSize: 13 }}>{t('resources')}</a>
          <a href="/privacy" style={{ color: '#8b949e', textDecoration: 'none', fontSize: 13 }}>{t('privacy')}</a>
        </div>
      </div>
    </div>
  )
}
