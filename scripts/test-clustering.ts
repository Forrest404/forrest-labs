import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !serviceRoleKey) {
  console.error(
    'Missing env vars: NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set',
  )
  process.exit(1)
}

const supabase = createClient(supabaseUrl, serviceRoleKey)

// Beirut centre
const BEIRUT_LAT = 33.8938
const BEIRUT_LON = 35.5018

function randomOffset(): number {
  return (Math.random() - 0.5) * 0.004 // ±0.002°
}

// Simple deterministic hash stand-in — just use randomUUID slices so each
// report looks like it came from a distinct session and IP.
function fakeHash(prefix: string): string {
  return `${prefix}-${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`
}

const distanceBands = ['under_500m', '500m_1km', 'under_500m', '500m_1km',
  'under_500m', '500m_1km', 'under_500m', '500m_1km']

const eventTypeSets = [
  ['explosion'],
  ['airstrike', 'smoke'],
  ['explosion'],
  ['gunfire'],
  ['explosion', 'smoke'],
  ['airstrike'],
  ['explosion'],
  ['gunfire', 'explosion'],
]

async function main() {
  const now = Date.now()

  // Build 8 reports spread 1 minute apart over the last 8 minutes
  const testReports = Array.from({ length: 8 }, (_, i) => ({
    lat: BEIRUT_LAT + randomOffset(),
    lon: BEIRUT_LON + randomOffset(),
    distance_band: distanceBands[i],
    event_types: eventTypeSets[i],
    session_hash: fakeHash('sess'),
    ip_hash: fakeHash('ip'),
    media_status: 'none',
    status: 'pending',
    created_at: new Date(now - (8 - i) * 60 * 1000).toISOString(),
  }))

  // 1. Insert
  const { data: inserted, error: insertError } = await supabase
    .from('reports')
    .insert(testReports)
    .select('id')

  if (insertError || !inserted) {
    console.error('Insert failed:', insertError?.message)
    process.exit(1)
  }

  const insertedIds = inserted.map((r: { id: string }) => r.id)
  console.log(`Inserted ${insertedIds.length} test reports. Waiting 75 seconds for clustering to run...`)

  // 2. Wait for the pg_cron job to fire
  await new Promise((resolve) => setTimeout(resolve, 75_000))

  // 3. Query clusters that reference any of our test report IDs
  const { data: clusters, error: clusterError } = await supabase
    .from('clusters')
    .select(
      'id, confidence_score, status, report_count, centroid_lat, centroid_lon, created_at',
    )
    .overlaps('report_ids', insertedIds)

  if (clusterError) {
    console.error('Cluster query failed:', clusterError.message)
  } else {
    console.log('\nClusters found:')
    console.log(JSON.stringify(clusters, null, 2))
  }

  // 4. Verdict
  const passed = (clusters ?? []).some(
    (c: { confidence_score: number }) => c.confidence_score > 0,
  )
  console.log(`\nTest result: ${passed ? 'PASS ✓' : 'FAIL ✗'}`)
  if (!passed) {
    console.log('No cluster with confidence_score > 0 was created.')
  }

  // 5. Cleanup — delete test reports regardless of outcome
  const { error: deleteError } = await supabase
    .from('reports')
    .delete()
    .in('id', insertedIds)

  if (deleteError) {
    console.error('Cleanup failed:', deleteError.message)
  } else {
    console.log('Test reports deleted.')
  }

  process.exit(passed ? 0 : 1)
}

main()
