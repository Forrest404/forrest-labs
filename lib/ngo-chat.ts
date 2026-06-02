// Group-chat link validation + platform inference. SECURITY control: only allow
// https and known chat-app invite hosts; reject javascript:/data:/anything else so
// a stored link can never carry an XSS payload or a non-web scheme. Enforced
// server-side on every create/update; the client mirrors it for fast feedback.

export type ChatPlatform = 'signal' | 'whatsapp' | 'telegram' | 'other'

const MAX_URL_LEN = 2048

// Hosts (and their platform) that we accept as chat-group invites. Any other host
// is still allowed ONLY if it is plain https (platform 'other'); non-https is rejected.
const KNOWN_HOSTS: { host: string; platform: ChatPlatform }[] = [
  { host: 'signal.group', platform: 'signal' },
  { host: 'chat.whatsapp.com', platform: 'whatsapp' },
  { host: 'wa.me', platform: 'whatsapp' },
  { host: 't.me', platform: 'telegram' },
  { host: 'telegram.me', platform: 'telegram' },
]

export interface ValidatedChatUrl {
  ok: true
  url: string
  platform: ChatPlatform
}
export interface InvalidChatUrl {
  ok: false
  error: string
}

// Normalise + validate a user-supplied chat URL. Accepts a bare known host
// (e.g. "signal.group/xyz" or "t.me/foo") by prefixing https://. Returns the
// normalised https URL and the inferred platform, or a clear rejection message.
export function validateChatUrl(raw: string): ValidatedChatUrl | InvalidChatUrl {
  let s = (raw ?? '').trim()
  if (!s) return { ok: false, error: 'A link is required.' }
  if (s.length > MAX_URL_LEN) return { ok: false, error: 'That link is too long.' }

  const lower = s.toLowerCase()
  // Hard-reject dangerous schemes up front (before any prefixing).
  if (lower.startsWith('javascript:') || lower.startsWith('data:') || lower.startsWith('vbscript:') || lower.startsWith('file:')) {
    return { ok: false, error: 'That link type is not allowed. Use an https:// chat invite link.' }
  }

  // Allow bare known hosts by prefixing https:// (e.g. "t.me/foo", "signal.group/x").
  if (!/^https?:\/\//i.test(s)) {
    const bareHost = KNOWN_HOSTS.find((k) => lower.startsWith(k.host + '/') || lower === k.host)
    if (bareHost) s = 'https://' + s
    else if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
      // Has some other scheme (mailto:, tel:, app:, …) — not a chat web link.
      return { ok: false, error: 'Only https chat-invite links are allowed.' }
    } else {
      // No scheme and not a known host — assume https and validate below.
      s = 'https://' + s
    }
  }

  let parsed: URL
  try {
    parsed = new URL(s)
  } catch {
    return { ok: false, error: 'That doesn’t look like a valid link.' }
  }

  // Only https is permitted (upgrade a known-host http to https; reject other http).
  const host = parsed.hostname.toLowerCase()
  const known = KNOWN_HOSTS.find((k) => host === k.host || host.endsWith('.' + k.host))
  if (parsed.protocol !== 'https:') {
    if (parsed.protocol === 'http:' && known) {
      parsed.protocol = 'https:'
    } else {
      return { ok: false, error: 'Links must use https://.' }
    }
  }

  return { ok: true, url: parsed.toString(), platform: known?.platform ?? 'other' }
}

// Display label for a platform (UI fallback uses the value itself).
export function platformLabel(p: string): string {
  switch (p) {
    case 'signal': return 'Signal'
    case 'whatsapp': return 'WhatsApp'
    case 'telegram': return 'Telegram'
    default: return 'Other'
  }
}
