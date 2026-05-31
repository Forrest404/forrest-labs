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

// Coarsen a coordinate to area-level precision (data minimisation). Precise GPS is for
// in-org RESCUE/OPS only (board pins, dispatch navigation, panic response, a worker's own
// view). Any AWARENESS surface — above all cross-org sharing (default off; see org
// settings) — must use this so a shared position reveals only a rough area, never a pin.
//   decimals: 2 ≈ 1.1 km, 1 ≈ 11 km. Default 2 (neighbourhood-level).
export function coarsen(lat: number, lon: number, decimals = 2): { lat: number; lon: number } {
  const f = Math.pow(10, decimals)
  return { lat: Math.round(lat * f) / f, lon: Math.round(lon * f) / f }
}
