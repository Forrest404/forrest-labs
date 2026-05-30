import 'server-only'

// Shared dispatch helpers. Read-only on clusters.

export const DISPATCH_FLOW = ['assigned', 'en_route', 'on_scene', 'done'] as const
export const ACTIVE_DISPATCH = ['assigned', 'en_route', 'on_scene']

// Hazard (cluster.dominant_event_types[0]) → preferred team types for a match boost.
const HAZARD_TEAM_TYPES: Record<string, string[]> = {
  airstrike: ['medical', 'rescue'],
  shelling: ['medical', 'rescue'],
  explosion: ['medical', 'rescue'],
  rocket: ['medical', 'rescue'],
  gunfire: ['medical'],
  collapse: ['rescue'],
  building_collapse: ['rescue'],
  fire: ['rescue'],
  flood: ['rescue', 'shelter'],
  displacement: ['shelter', 'assessment'],
  unrest: ['assessment'],
}

export function hazardOf(cluster: { dominant_event_types?: string[] | null }): string | null {
  return cluster?.dominant_event_types?.[0] ?? null
}

export function preferredTeamTypes(hazard: string | null): string[] {
  return hazard ? HAZARD_TEAM_TYPES[hazard] ?? [] : []
}

export function mapLink(lat: number, lon: number): string {
  return `https://www.google.com/maps?q=${lat},${lon}`
}

// Haversine distance in km.
export function distanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 10) / 10
}

// Reverse-geocode a centroid to a place name (Mapbox). Falls back to coordinates.
export async function geocode(lat: number, lon: number): Promise<string> {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN
  const fallback = `${lat.toFixed(3)}, ${lon.toFixed(3)}`
  if (!token) return fallback
  try {
    const url = `https://api.mapbox.com/geocoding/v5/mapbox.places/${lon},${lat}.json?access_token=${token}&types=neighborhood,locality,place`
    const res = await fetch(url)
    const data = (await res.json()) as { features?: { place_name: string }[] }
    return data.features?.[0]?.place_name ?? fallback
  } catch {
    return fallback
  }
}
