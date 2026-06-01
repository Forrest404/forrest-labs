// Public-facing privacy policy for the NOUR civilian hazard-reporting service. This is a
// top-level public route (not under /ngo, /admin, …) so it is reachable without signing in.
// It is scoped to the PUBLIC service (anonymous reporting + the live map). Aid organisations
// using the NGO Dashboard are covered by a separate policy at /ngo/privacy/policy.
//
// Server component (no interactivity) → prerendered static.

export const metadata = {
  title: 'Privacy Policy · NOUR',
  description: 'How NOUR collects, uses, and protects data from the public hazard-reporting service.',
}

const EFFECTIVE = '1 June 2026'
const VERSION = '1.0'

const TOC: { id: string; t: string }[] = [
  { id: 'intro', t: 'Introduction' },
  { id: 'controller', t: 'Who is responsible for your data' },
  { id: 'collect', t: 'What we collect when you report' },
  { id: 'dont', t: 'What we do not collect' },
  { id: 'why', t: 'Why we use it and our legal bases' },
  { id: 'ai', t: 'Automated processing and AI' },
  { id: 'sharing', t: 'Who we share data with' },
  { id: 'transfers', t: 'International data transfers' },
  { id: 'retention', t: 'How long we keep data' },
  { id: 'security', t: 'How we protect your data' },
  { id: 'rights', t: 'Your rights' },
  { id: 'cookies', t: 'Cookies and on-device storage' },
  { id: 'children', t: 'Children' },
  { id: 'changes', t: 'Changes to this policy' },
  { id: 'contact', t: 'Contact and complaints' },
  { id: 'limits', t: 'An honest note on the limits of protection' },
]

export default function PublicPrivacyPage() {
  return (
    <div style={wrap}>
      <a href="/" style={{ ...link, fontSize: 13 }}>← Back to NOUR</a>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={meta}>Public reporting service · Version {VERSION} · Effective {EFFECTIVE}</p>
      <p style={lede}>
        NOUR is a civilian-safety platform that lets anyone report strikes, shelling,
        flooding, fires, and other hazards from any phone — with no app and no account — so
        that incidents can be verified and shown on a live public map. This policy explains
        what data the public reporting service collects, why, and the rights you have. We
        designed the service to need as little personal data as possible.
      </p>
      <p style={lede}>
        Aid organisations that use NOUR’s separate, sign-in-only dashboard to manage their own
        teams are covered by a dedicated policy provided within that dashboard.
      </p>

      <nav style={tocBox} aria-label="Contents">
        <div style={tocHead}>Contents</div>
        <ol style={tocList}>
          {TOC.map((s, i) => <li key={s.id}><a href={`#${s.id}`} style={link}>{i + 1}. {s.t}</a></li>)}
        </ol>
      </nav>

      <S id="intro" n={1} t="Introduction">
        <P>This policy applies to the public parts of NOUR available at noursystems.org: the
        hazard report form, the public live map, and related public information pages. By
        using these services you acknowledge the practices described here.</P>
      </S>

      <S id="controller" n={2} t="Who is responsible for your data">
        <P>The data controller for the NOUR platform is <B>Forrest Labs</B> (“we”, “us”). You
        can contact us using the details in Section 15.</P>
      </S>

      <S id="collect" n={3} t="What we collect when you report">
        <P>When you submit a hazard report, we process:</P>
        <UL items={[
          'the approximate location you report (latitude and longitude) and a distance band indicating how close you were;',
          'the hazard type(s) you select and the time of the report;',
          'an anonymous, randomly generated session identifier, and a one-way hashed (irreversible) form of your network (IP) address used only to prevent spam and abuse;',
          'any photo or video you choose to attach — which is optional. Attached media is automatically processed to blur faces before it is stored or reviewed.',
        ]} />
        <P>When you view the public map, we process only the limited technical data needed to
        serve the page securely.</P>
      </S>

      <S id="dont" n={4} t="What we do not collect">
        <UL items={[
          'We do not ask for, or require, your name, email address, or phone number to report.',
          'We do not store your raw IP address — only an irreversible hash of it.',
          'We do not use advertising cookies or cross-site tracking, and we do not sell data.',
          'We do not track your device location in the background — a location is only taken from the report you choose to submit.',
        ]} />
      </S>

      <S id="why" n={5} t="Why we use it and our legal bases">
        <P>We use this data only to operate the safety service: to cluster and verify reports,
        cross-reference public news and official sources, show verified incidents on the
        public map, and keep the service secure against abuse. Our lawful bases under
        applicable data-protection law — principally Lebanon’s Law No. 81 of 10 October 2018
        (Electronic Transactions and Personal Data), with the EU/UK General Data Protection
        Regulation applied as our baseline standard — are the protection of the vital
        interests of people in danger, the performance of a task in the public interest,
        your consent in submitting a report, and our legitimate interests in keeping the
        service accurate and secure.</P>
      </S>

      <S id="ai" n={6} t="Automated processing and AI">
        <P>NOUR uses automated processing, including a large-language-model service
        (Anthropic’s Claude API), to help cluster and verify incoming reports and
        cross-reference public sources. These tools assist human-overseen verification; we do
        not use your data to make decisions producing legal or similarly significant effects
        about you. Only the data needed for the task is sent to this provider (Section 7).</P>
      </S>

      <S id="sharing" n={7} t="Who we share data with">
        <P>We do not sell personal data. We use a small number of trusted service providers
        (sub-processors) to run the service, each bound to process data only on our behalf:</P>
        <DL items={[
          ['Supabase', 'Database and file-storage hosting for reports and media.'],
          ['Vercel', 'Application hosting and content delivery.'],
          ['Anthropic (Claude API)', 'AI assistance for verification (Section 6).'],
          ['Railway', 'The face-blurring service that obscures faces in submitted media before storage.'],
          ['Mapbox', 'Map display in your browser.'],
          ['ntfy', 'Delivery of public hazard/all-clear notifications where applicable.'],
        ]} />
        <P>Verified incident information (such as a hazard type and an approximate location)
        is shown publicly on the live map by design — this is the purpose of the service.
        Media is shown only after faces are blurred and review. We may also disclose data
        where required by law or to protect the vital interests of any person.</P>
      </S>

      <S id="transfers" n={8} t="International data transfers">
        <P>Our service providers may process data in countries outside the one in which you
        are located. Where data is transferred internationally, we rely on appropriate
        safeguards recognised under applicable law to protect it. You can request more
        information using the contact details in Section 15.</P>
      </S>

      <S id="retention" n={9} t="How long we keep data">
        <UL items={[
          'Report data is retained for as long as needed to operate the verification service and the public live map, and to maintain an accurate public record of incidents.',
          'Submitted media is retained after face-blurring as part of the incident record; media that fails review may be removed.',
          'Technical and anti-abuse data (such as the hashed IP and rate-limiting counters) is kept only as long as needed for security purposes, then deleted or aggregated.',
        ]} />
      </S>

      <S id="security" n={10} t="How we protect your data">
        <UL items={[
          'Encrypted connections (industry-standard transport security) for all traffic.',
          'No raw IP storage — only an irreversible hash, used solely for abuse prevention.',
          'Automatic face-blurring of submitted media before storage or review.',
          'Rate limiting and other safeguards to prevent abuse of the reporting service.',
          'Internal controls that keep secrets off user devices and limit who can access stored data.',
        ]} />
        <P>No system is perfectly secure; Section 16 is honest about what these measures do
        and do not protect against.</P>
      </S>

      <S id="rights" n={11} t="Your rights">
        <P>Subject to applicable law, you have rights to access, correct, erase, restrict, or
        object to the processing of your personal data, to data portability, to withdraw
        consent, and to complain to a supervisory authority. Because reports are submitted
        <B> without an account</B> and IP addresses are stored only as an irreversible hash,
        we usually cannot identify you or link a particular report back to you — which means
        we may be unable to locate “your” data to action some requests. Where you can give us
        enough detail to identify specific data (for example a report you submitted), we will
        act on your request as the law requires. Contact us using Section 15.</P>
      </S>

      <S id="cookies" n={12} t="Cookies and on-device storage">
        <P>The public service uses only strictly necessary storage — for example to remember
        your language choice or to let the report form work on a poor connection. We do not
        use advertising or cross-site tracking cookies.</P>
      </S>

      <S id="children" n={13} t="Children">
        <P>NOUR is intended for use by adults. It is not directed at children, and we do not
        knowingly collect children’s personal data. If you believe a child’s data has been
        provided to us, contact us and we will take appropriate steps.</P>
      </S>

      <S id="changes" n={14} t="Changes to this policy">
        <P>We may update this policy from time to time. When we make material changes we will
        update the version and effective date shown above. Your continued use of the service
        after a change takes effect constitutes acknowledgement of the updated policy.</P>
      </S>

      <S id="contact" n={15} t="Contact and complaints">
        <P>For privacy questions or to exercise your rights, contact Forrest Labs at{' '}
        <B>shadi@forrestlabs.org</B>. We have not appointed a dedicated data protection
        officer; privacy enquiries are handled by Forrest Labs at that address.</P>
        <P>If you are not satisfied with our response, you have the right to lodge a complaint
        with the competent data-protection supervisory authority in your jurisdiction — in
        Lebanon, under <B>Law No. 81 of 10 October 2018 (Electronic Transactions and Personal
        Data)</B>, or, where applicable, with the relevant EU/EEA supervisory authority.</P>
      </S>

      <S id="limits" n={16} t="An honest note on the limits of protection">
        <P>We believe in being straight with the people who rely on this tool. NOUR’s
        protections — encrypted connections, no raw-IP storage, face-blurring, and
        least-data-by-default — are strong against common threats. They are <B>not</B> a
        guarantee against a determined, well-resourced adversary such as a nation-state. Share
        only the detail a report genuinely needs, and for sensitive personal communication use
        a dedicated secure messaging app rather than any single system.</P>
      </S>

      <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #21262d' }}>
        <a href="/" style={link}>← Back to NOUR</a>
        <span style={{ color: '#484f58' }}>{'  ·  '}</span>
        <a href="/report" style={link}>Report a hazard</a>
        <span style={{ color: '#484f58' }}>{'  ·  '}</span>
        <a href="/map" style={link}>Live map</a>
      </div>
      <p style={{ ...meta, marginTop: 16 }}>Version {VERSION} · Effective {EFFECTIVE}</p>
    </div>
  )
}

function S({ id, n, t, children }: { id: string; n: number; t: string; children: React.ReactNode }) {
  return (
    <section id={id} style={{ marginBottom: 26, scrollMarginTop: 16 }}>
      <h2 style={h2}>{n}. {t}</h2>
      {children}
    </section>
  )
}
function P({ children }: { children: React.ReactNode }) { return <p style={p}>{children}</p> }
function B({ children }: { children: React.ReactNode }) { return <b style={{ color: '#e6edf3' }}>{children}</b> }
function UL({ items }: { items: string[] }) {
  return <ul style={ul}>{items.map((it, i) => <li key={i}>{it}</li>)}</ul>
}
function DL({ items }: { items: [string, string][] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, margin: '4px 0 10px' }}>
      {items.map(([name, desc], i) => (
        <div key={i} style={{ fontSize: 14, color: '#c9d1d9' }}>
          <b style={{ color: '#e6edf3' }}>{name}</b> — {desc}
        </div>
      ))}
    </div>
  )
}

const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6, background: '#0d1117', minHeight: '100vh' }
const h1: React.CSSProperties = { fontSize: 26, fontWeight: 700, margin: '10px 0 2px' }
const h2: React.CSSProperties = { fontSize: 17, fontWeight: 600, margin: '0 0 8px', color: '#e6edf3' }
const meta: React.CSSProperties = { fontSize: 12, color: '#8b949e', margin: '0 0 18px' }
const lede: React.CSSProperties = { fontSize: 15, color: '#c9d1d9', margin: '0 0 16px' }
const p: React.CSSProperties = { fontSize: 14, color: '#c9d1d9', margin: '0 0 10px' }
const ul: React.CSSProperties = { fontSize: 14, color: '#c9d1d9', margin: '0 0 10px', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }
const link: React.CSSProperties = { color: '#58a6ff', textDecoration: 'none' }
const tocBox: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '14px 18px', margin: '0 0 28px' }
const tocHead: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }
const tocList: React.CSSProperties = { margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5 }
