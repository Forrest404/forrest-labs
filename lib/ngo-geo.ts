// Shared NGO geospatial helpers. Single source of truth for point-in-polygon over
// an org's operational area (a GeoJSON Polygon), used by the situation board and the
// reports generator to decide which incidents fall inside an org's area of operations.

// Ray-casting point-in-polygon over a GeoJSON Polygon's outer ring ([lon,lat]).
export function pointInPolygon(
  lon: number,
  lat: number,
  polygon: { type?: string; coordinates?: number[][][] } | null | undefined,
): boolean {
  const ring = polygon?.coordinates?.[0]
  if (!Array.isArray(ring) || ring.length < 4) return false
  let inside = false
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]
    const [xj, yj] = ring[j]
    const intersects = yi > lat !== yj > lat && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi
    if (intersects) inside = !inside
  }
  return inside
}

// Validate untrusted GeoJSON for an operational area before it's stored or fed to
// pointInPolygon. Accepts a Polygon (or the first polygon of a MultiPolygon). Enforces a
// vertex cap so a malicious payload can't blow up storage or the ray-cast loop, and that
// every coordinate is a finite [lon,lat] in range. Returns a normalized Polygon or null.
const MAX_POLYGON_VERTICES = 2000
export function validatePolygon(input: unknown): { type: 'Polygon'; coordinates: number[][][] } | null {
  if (!input || typeof input !== 'object') return null
  const g = input as { type?: unknown; coordinates?: unknown }
  let rings: unknown
  if (g.type === 'Polygon') rings = g.coordinates
  else if (g.type === 'MultiPolygon') rings = Array.isArray(g.coordinates) ? (g.coordinates as unknown[])[0] : undefined
  else return null
  if (!Array.isArray(rings) || rings.length === 0) return null

  let total = 0
  const outRings: number[][][] = []
  for (const ring of rings) {
    if (!Array.isArray(ring) || ring.length < 4) return null // a ring needs ≥4 points (closed)
    const outRing: number[][] = []
    for (const pt of ring) {
      if (!Array.isArray(pt) || pt.length < 2) return null
      const lon = Number(pt[0]); const lat = Number(pt[1])
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null
      if (lon < -180 || lon > 180 || lat < -90 || lat > 90) return null
      if (++total > MAX_POLYGON_VERTICES) return null
      outRing.push([lon, lat])
    }
    outRings.push(outRing)
  }
  return { type: 'Polygon', coordinates: outRings }
}

// Coarsen a coordinate to area-level precision (data minimisation). Precise GPS is for
// in-org RESCUE/OPS only (board pins, dispatch navigation, panic response, a worker's own
// view). Any AWARENESS surface — above all cross-org sharing (default off; see org
// settings) — must use this so a shared position reveals only a rough area, never a pin.
//   decimals: 2 ≈ 1.1 km, 1 ≈ 11 km. Default 2 (neighbourhood-level).
export function coarsen(lat: number, lon: number, decimals = 2): { lat: number; lon: number } {
  const f = Math.pow(10, decimals)
  return { lat: Math.round(lat * f) / f, lon: Math.round(lon * f) / f }
}
