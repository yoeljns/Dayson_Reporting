/** Small geo helpers: Haversine distance and Turkish distance formatting. */
export type LatLng = { lat: number; lng: number };

export function distanceMeters(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

export const fmtDistance = (m: number) =>
  m < 1000 ? `${Math.round(m / 10) * 10} m` : `${(m / 1000).toLocaleString("tr-TR", { maximumFractionDigits: 1 })} km`;

export const validLatLng = (lat: unknown, lng: unknown): LatLng | null => {
  const a = Number(lat);
  const b = Number(lng);
  return Number.isFinite(a) && Number.isFinite(b) && Math.abs(a) <= 90 && Math.abs(b) <= 180 ? { lat: a, lng: b } : null;
};

export const mapsUrl = (p: LatLng) => `https://www.google.com/maps?q=${p.lat},${p.lng}`;

/** Farther than this from the company's pin, the manager sees a warning. */
export const FAR_METERS = 2000;
