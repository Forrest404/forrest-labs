const REQUIRED_SERVER = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'NEXT_PUBLIC_MAPBOX_TOKEN',
  'ANTHROPIC_API_KEY',
  'NTFY_CHANNEL',
  'REVIEW_SECRET_KEY',
  'ADMIN_PASSWORD',
  'ADMIN_JWT_SECRET',
  'NEXT_PUBLIC_APP_URL',
]

export function validateEnv(): void {
  if (process.env.NODE_ENV === 'production') {
    const missing = REQUIRED_SERVER.filter((k) => !process.env[k])
    if (missing.length > 0) {
      console.error('[env] MISSING ENV VARS:', missing.join(', '))
    }
  }
}
