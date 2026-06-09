'use client'

import Link from 'next/link'

// Full legal privacy policy for the NOUR NGO dashboard. Linked from Settings and from the
// plain-language data statement (/ngo/privacy). Reachable by every role.
//
// IMPORTANT (for the operator, not the reader): bracketed [ … ] items must be completed
// with your organisation's real details, and this document should be reviewed by qualified
// legal counsel for your jurisdiction(s) before you rely on it. It is written to reflect
// what the system actually does, to a GDPR-informed standard.

const EFFECTIVE = '1 June 2026'
const VERSION = '1.0'

const TOC: { id: string; n: number; t: string }[] = [
  { id: 'intro', n: 1, t: 'Introduction' },
  { id: 'controller', n: 2, t: 'Who is responsible for your data' },
  { id: 'scope', n: 3, t: 'Scope of this policy' },
  { id: 'data', n: 4, t: 'The personal data we process' },
  { id: 'special', n: 5, t: 'Sensitive (special-category) data' },
  { id: 'collect', n: 6, t: 'How we collect your data' },
  { id: 'why', n: 7, t: 'Why we use your data and our legal bases' },
  { id: 'ai', n: 8, t: 'Automated processing and artificial intelligence' },
  { id: 'minimisation', n: 9, t: 'Data minimisation' },
  { id: 'sharing', n: 10, t: 'Who we share data with' },
  { id: 'transfers', n: 11, t: 'International data transfers' },
  { id: 'retention', n: 12, t: 'How long we keep data' },
  { id: 'security', n: 13, t: 'How we protect your data' },
  { id: 'rights', n: 14, t: 'Your rights' },
  { id: 'exercise', n: 15, t: 'How to exercise your rights' },
  { id: 'cookies', n: 16, t: 'Cookies and on-device storage' },
  { id: 'children', n: 17, t: 'Children' },
  { id: 'breach', n: 18, t: 'Data breaches' },
  { id: 'thirdparty', n: 19, t: 'Third-party links and services' },
  { id: 'changes', n: 20, t: 'Changes to this policy' },
  { id: 'contact', n: 21, t: 'Contact and complaints' },
  { id: 'limits', n: 22, t: 'An honest note on the limits of protection' },
]

export default function NgoPrivacyPolicyPage() {
  return (
    <div style={wrap}>
      <Link href="/ngo/privacy" style={{ ...link, fontSize: 13 }}>← Back to the data summary</Link>
      <h1 style={h1}>Privacy Policy</h1>
      <p style={meta}>Version {VERSION} · Effective {EFFECTIVE}</p>
      <p style={lede}>
        This Privacy Policy explains how NOUR (“NOUR”, “we”, “us”) collects, uses, shares,
        and protects personal data, and the rights you have over your data. NOUR is a
        civilian-safety platform used to report and verify hazards in conflict and disaster
        zones and to help aid organisations account for their people and coordinate their
        response. Because the data we handle can include the locations of civilians and aid
        workers in dangerous environments, we treat it with particular care and collect as
        little of it as possible.
      </p>

      {/* Table of contents */}
      <nav style={tocBox} aria-label="Contents">
        <div style={tocHead}>Contents</div>
        <ol style={tocList}>
          {TOC.map((s) => (
            <li key={s.id}><a href={`#${s.id}`} style={link}>{s.t}</a></li>
          ))}
        </ol>
      </nav>

      <S id="intro" n={1} t="Introduction">
        <P>This policy applies to the NOUR platform available at noursystems.org, including
        the public hazard-reporting service and the dedicated dashboard used by
        non-governmental and aid organisations (“NGO Dashboard”). By using NOUR you
        acknowledge the practices described here. Where we act on instructions from an
        aid organisation that uses NOUR to manage its own teams, that organisation and NOUR
        share responsibility for the data as described in Section 2.</P>
      </S>

      <S id="controller" n={2} t="Who is responsible for your data">
        <P>The data controller for the NOUR platform is <B>Forrest Labs</B> (“the
        Operator”).</P>
        <P>For data created inside the NGO Dashboard by an aid organisation about its own
        staff and operations (for example team rosters, check-ins, and incident notes), that
        aid organisation is the controller of its own data and NOUR acts as its processor,
        handling that data only to provide the service. Each aid organisation’s data is
        isolated from every other organisation.</P>
        <P>If you have questions about this policy or how your data is handled, contact us
        using the details in Section 21.</P>
      </S>

      <S id="scope" n={3} t="Scope of this policy">
        <P>This policy covers personal data processed through:</P>
        <UL items={[
          'the public reporting service, where members of the public report strikes, shelling, flooding, fires and other hazards;',
          'the public live map and related public information pages;',
          'the NGO Dashboard, used by approved aid organisations to manage their teams and respond to incidents.',
        ]} />
        <P>It does not cover third-party services that you choose to use alongside NOUR (for
        example external messaging apps you link to), which are governed by their own
        policies — see Section 19.</P>
      </S>

      <S id="data" n={4} t="The personal data we process">
        <P><B>4.1 Public reporters.</B> The public reporting service is designed to be used
        without an account. When you submit a report we process:</P>
        <UL items={[
          'the approximate location you report (latitude and longitude) and a distance band;',
          'the hazard types you select and the time of the report;',
          'an anonymous session identifier and a one-way hashed form of your network (IP) address — we do not store your raw IP address;',
          'any photo or video you optionally choose to attach, which is automatically processed to blur faces before it is stored or reviewed.',
        ]} />
        <P>We do not ask public reporters for their name, email, or phone number.</P>

        <P><B>4.2 NGO Dashboard users.</B> When your organisation creates an account for you,
        or you accept an invitation, we process:</P>
        <UL items={[
          'identity and contact details: your name, email address, phone number, and role;',
          'authentication data: a securely hashed password or PIN, two-factor authentication secrets if enabled, and session records;',
          'team data you or your organisation add: team membership, and for team members their contact details, emergency contact, and certifications;',
          'location data tied to specific actions: a GPS point captured when you tap “check in”, your last-known position, and the location attached to a panic or duress alert. GPS is captured only on those actions — never continuously or in the background;',
          'operational data: incidents you log, dispatches, on-scene reports, facilities, contacts, internal notes, broadcasts, and roll-call responses;',
          'your notification preferences and availability (on/off duty);',
          'technical and security records: delivery logs for notifications (which record that a message was sent on a channel, never its contents), rate-limiting counters keyed to a hashed identifier, and administrative audit logs.',
        ]} />

        <P><B>4.3 Technical data.</B> For all users we process limited technical data needed
        to operate and secure the service, such as session cookies (Section 16) and
        security event records. We do not use advertising or cross-site tracking
        technologies.</P>
      </S>

      <S id="special" n={5} t="Sensitive (special-category) data">
        <P>Some of the data NOUR processes can be sensitive. Location data about an
        identifiable person in a conflict zone, and information within incident or casualty
        reports, may reveal or imply special categories of data under applicable law (for
        example data concerning health, or data that could indicate political or other
        protected characteristics). We process such data only where strictly necessary for
        the safety purposes described in this policy, on the legal bases set out in
        Section 7 (including the protection of vital interests and, for dashboard users, with
        consent or to perform our agreement with your organisation), and subject to the
        minimisation and security measures in Sections 9 and 13.</P>
      </S>

      <S id="collect" n={6} t="How we collect your data">
        <UL items={[
          'Directly from you — when you submit a report, check in, raise an alert, or enter information into the dashboard.',
          'From your organisation — when an administrator creates your account, adds you to a team, or records information about your role.',
          'Automatically — limited technical and security data generated when you use the service (for example session and security records).',
        ]} />
      </S>

      <S id="why" n={7} t="Why we use your data and our legal bases">
        <P>We use personal data only for the following purposes, each with a lawful basis
        under applicable data-protection law — principally Lebanon’s Law No. 81 of 10 October
        2018 (Electronic Transactions and Personal Data), with the EU/UK General Data
        Protection Regulation applied as our baseline standard:</P>
        <UL items={[
          'To protect people’s lives and safety — verifying hazards, raising panic and duress alerts, accounting for staff, and coordinating response. Legal bases: protection of the vital interests of you or others; substantial public interest; and, where applicable, consent.',
          'To provide the service to aid organisations — operating accounts, teams, dispatch and reporting. Legal basis: performance of a contract with your organisation, and our and your organisation’s legitimate interests in coordinating aid safely.',
          'To secure the service — authentication, rate limiting, abuse prevention, and audit logging. Legal basis: our legitimate interests in keeping the platform and its users safe, and compliance with legal obligations.',
          'To communicate with you — sending operational and safety notifications you are entitled to receive. Legal bases: vital interests and legitimate interests for safety-critical alerts; consent or legitimate interests for other notifications, subject to your preferences.',
          'To comply with law — meeting legal obligations and responding to lawful requests. Legal basis: compliance with a legal obligation.',
        ]} />
        <P>Where we rely on consent, you may withdraw it at any time (Section 14); withdrawal
        does not affect processing already carried out. Note that some safety-critical
        alerts (such as panic and roll-call) cannot be switched off while you hold an active
        account, because their purpose is to keep you and your colleagues alive.</P>
      </S>

      <S id="ai" n={8} t="Automated processing and artificial intelligence">
        <P>NOUR uses automated processing, including a large-language-model service
        (Anthropic’s Claude API), to help cluster and verify incoming hazard reports,
        cross-reference public news and official sources, and draft situation reports from
        operational records. These tools assist human decision-making; verified incidents
        and reports remain subject to human oversight. We do not use your data to make
        decisions that produce legal or similarly significant effects about you without a
        lawful basis and, where required, human review. Data sent to our AI sub-processor is
        limited to what is needed for the task and is handled under that provider’s
        commitments described in Section 10.</P>
      </S>

      <S id="minimisation" n={9} t="Data minimisation">
        <P>Minimising data is a core design principle of NOUR, not an afterthought. We
        collect little, retain less, and share nothing across organisations by default. GPS
        is captured only on a deliberate action (a check-in or an alert), never continuously.
        We store only a person’s latest position, not a movement history, so a team’s past
        path cannot be reconstructed. Notification messages and exports are written to avoid
        carrying precise coordinates, and any cross-organisation awareness view (off by
        default) is coarsened to a rough area and a team type only.</P>
      </S>

      <S id="sharing" n={10} t="Who we share data with">
        <P>We do not sell personal data. We do not share an aid organisation’s data with any
        other organisation except where that organisation explicitly opts in to limited
        cross-organisation awareness, which shares only team type and a rough area — never
        names or precise locations.</P>
        <P>We use a small number of trusted service providers (sub-processors) to run the
        platform. Each processes data only to provide its service to us, under contractual
        confidentiality and security obligations:</P>
        <DL items={[
          ['Supabase', 'Database, authentication storage, and file storage hosting.'],
          ['Vercel', 'Application hosting and content delivery.'],
          ['Anthropic (Claude API)', 'AI assistance for verification and report drafting (Section 8).'],
          ['Railway', 'The face-blurring service that obscures faces in uploaded media before storage.'],
          ['ntfy', 'Delivery of push notifications.'],
          ['Resend', 'Delivery of transactional email (invitations, password resets, security notices).'],
          ['Mapbox', 'Map display in your browser or app.'],
          ['An SMS gateway', 'Not currently used — SMS alerting is disabled in this version.'],
        ]} />
        <P>We may also disclose data where required by law, to establish or defend legal
        claims, or to protect the vital interests of any person.</P>
      </S>

      <S id="transfers" n={11} t="International data transfers">
        <P>Our service providers may process data in countries outside the one in which you
        are located, including outside your home jurisdiction. Where data is transferred
        internationally, we rely on appropriate safeguards recognised under applicable law
        (such as standard contractual clauses or an adequacy decision) to protect it. You can
        request more information about these safeguards using the contact details in
        Section 21.</P>
      </S>

      <S id="retention" n={12} t="How long we keep data">
        <UL items={[
          'Location data — check-ins, GPS points, resolved panic alerts, and roll-call data — is permanently and automatically deleted after a retention window configured by your organisation (commonly 48 hours; the live value is shown on the data summary page). An organisation administrator can shorten the window or trigger an immediate purge.',
          'Active (unresolved) panic alerts are kept until resolved, then fall under the same deletion window.',
          'Account and operational records are kept while your account or your organisation’s account is active, and deleted or anonymised within a reasonable period after the account is closed, unless we must keep them longer to meet a legal obligation or to resolve disputes.',
          'Public report content is retained as needed to operate the public verification service and live map; technical security records are kept only as long as needed for security and audit purposes.',
        ]} />
      </S>

      <S id="security" n={13} t="How we protect your data">
        <UL items={[
          'Encryption of data in transit using industry-standard transport security.',
          'Strict per-organisation isolation, so one organisation can never access another’s data.',
          'Role-based access controls, and a separate, time-limited session for each part of the platform, stored in secure, HTTP-only cookies.',
          'Hashing of passwords and PINs, optional two-factor authentication, brute-force rate limiting on sign-in and other sensitive actions, and the ability for an administrator to sign a lost or compromised device out of all sessions immediately.',
          'Hard deletion of old location data on a schedule, and design choices that keep sensitive details (such as precise coordinates and names) out of notifications and exports.',
          'Automated checks that prevent secrets from reaching client devices and that enforce data-scoping on the server.',
        ]} />
        <P>No system is perfectly secure. Section 22 explains, honestly, what these measures
        do and do not protect against.</P>
      </S>

      <S id="rights" n={14} t="Your rights">
        <P>Subject to applicable law, you have the right to:</P>
        <UL items={[
          'access the personal data we hold about you;',
          'have inaccurate data corrected;',
          'have your data erased in certain circumstances;',
          'restrict or object to certain processing;',
          'receive certain data in a portable format;',
          'withdraw consent where processing is based on consent;',
          'not be subject to a solely automated decision with legal or similarly significant effect, except as permitted by law; and',
          'lodge a complaint with a data-protection supervisory authority.',
        ]} />
        <P>For data your organisation controls (Section 2), please direct rights requests to
        your organisation’s administrator in the first instance; we will assist them as their
        processor.</P>
      </S>

      <S id="exercise" n={15} t="How to exercise your rights">
        <P>Many actions are available to you directly in the product: you can view and update
        your profile and notification preferences, change your password or PIN, and sign out
        of all devices from <Link href="/ngo/settings" style={link}>Settings</Link>. Organisation
        administrators can manage users, adjust the location-retention window, and run an
        immediate purge of old location data. For any other request, contact us using the
        details in Section 21. We will respond within the timeframe required by applicable
        law and may need to verify your identity first.</P>
      </S>

      <S id="cookies" n={16} t="Cookies and on-device storage">
        <P>NOUR uses a small number of strictly necessary cookies to keep you signed in and to
        secure your session. These are secure, HTTP-only session cookies and are not used for
        advertising or cross-site tracking. The mobile field view may store a limited amount
        of data on your device so that it works offline and syncs when a connection returns;
        signing out clears location data cached on the device.</P>
      </S>

      <S id="children" n={17} t="Children">
        <P>NOUR is intended for use by adults — members of the public reporting hazards and
        professional aid workers. It is not directed at children, and we do not knowingly
        create accounts for children. If you believe a child’s personal data has been
        provided to us, contact us and we will take appropriate steps.</P>
      </S>

      <S id="breach" n={18} t="Data breaches">
        <P>We maintain measures to detect and respond to personal-data breaches. Where a
        breach is likely to result in a risk to your rights and freedoms, we will notify the
        relevant supervisory authority and, where required, affected individuals and
        organisations, in accordance with applicable law.</P>
      </S>

      <S id="thirdparty" n={19} t="Third-party links and services">
        <P>NOUR may show links to external services your organisation chooses to use, such as
        third-party group-messaging apps, and uses Mapbox to display maps in your browser.
        These third parties operate under their own privacy policies, which we do not
        control. Only follow links and join groups you trust.</P>
      </S>

      <S id="changes" n={20} t="Changes to this policy">
        <P>We may update this policy from time to time. When we make material changes, we will
        update the version and effective date above and, where appropriate, notify you. Your
        continued use of NOUR after a change takes effect constitutes acknowledgement of the
        updated policy.</P>
      </S>

      <S id="contact" n={21} t="Contact and complaints">
        <P>For privacy questions or to exercise your rights, contact us at{' '}
        <B>shadi@forrestlabs.org</B>. We have not appointed a dedicated data protection
        officer; privacy enquiries are handled by Forrest Labs at that address.</P>
        <P>If you are not satisfied with our response, you have the right to lodge a complaint
        with the competent data-protection supervisory authority in your jurisdiction — in
        Lebanon, under <B>Law No. 81 of 10 October 2018 (Electronic Transactions and Personal
        Data)</B>, or, where applicable, with the relevant EU/EEA supervisory authority.</P>
      </S>

      <S id="limits" n={22} t="An honest note on the limits of protection">
        <P>We believe in being straight with the people who rely on this tool. NOUR’s
        protections — encrypted connections, per-organisation isolation, hard deletion of old
        location data, and least-data-by-default — are strong against common threats such as
        a lost phone, a curious outsider, or another organisation. They are <B>not</B> a
        guarantee against a determined, well-resourced adversary such as a nation-state. For
        your most sensitive coordination, use a dedicated secure messaging app (such as
        Signal) alongside NOUR rather than relying on any single system, and always capture
        and share the least location detail the task actually requires.</P>
      </S>

      <div style={{ marginTop: 28, paddingTop: 16, borderTop: '1px solid #21262d' }}>
        <Link href="/ngo/settings" style={link}>← Back to settings</Link>
        <span style={{ color: '#484f58' }}>{'  ·  '}</span>
        <Link href="/ngo/privacy" style={link}>Data summary</Link>
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

const wrap: React.CSSProperties = { maxWidth: 760, margin: '0 auto', padding: '24px 16px 64px', color: '#e6edf3', fontFamily: 'system-ui, sans-serif', lineHeight: 1.6 }
const h1: React.CSSProperties = { fontSize: 26, fontWeight: 700, margin: '10px 0 2px' }
const h2: React.CSSProperties = { fontSize: 17, fontWeight: 600, margin: '0 0 8px', color: '#e6edf3' }
const meta: React.CSSProperties = { fontSize: 12, color: '#8b949e', margin: '0 0 18px' }
const lede: React.CSSProperties = { fontSize: 15, color: '#c9d1d9', margin: '0 0 20px' }
const p: React.CSSProperties = { fontSize: 14, color: '#c9d1d9', margin: '0 0 10px' }
const ul: React.CSSProperties = { fontSize: 14, color: '#c9d1d9', margin: '0 0 10px', paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 6 }
const link: React.CSSProperties = { color: '#58a6ff', textDecoration: 'none' }
const tocBox: React.CSSProperties = { background: '#161b22', border: '1px solid #21262d', borderRadius: 10, padding: '14px 18px', margin: '0 0 28px' }
const tocHead: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: '#8b949e', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }
const tocList: React.CSSProperties = { margin: 0, paddingInlineStart: 20, display: 'flex', flexDirection: 'column', gap: 4, fontSize: 13.5 }
