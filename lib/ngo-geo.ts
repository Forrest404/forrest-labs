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
