"use client";

import type { LatLng } from "@/lib/geo";

const KEY = "dayson:geo";

/** Rep's device-level choice: "1" on, "0" off, unset = not decided (treated as on after the browser prompt). */
export function geoEnabled(): boolean {
  try {
    return localStorage.getItem(KEY) !== "0";
  } catch {
    return true;
  }
}
export function geoDecided(): boolean {
  try {
    return localStorage.getItem(KEY) != null;
  } catch {
    return false;
  }
}
export function setGeoEnabled(on: boolean) {
  try {
    localStorage.setItem(KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** One-shot position; resolves null when unsupported, denied, off or slow. */
export function getPosition(timeoutMs = 8000): Promise<(LatLng & { accuracy: number | null }) | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation || !geoEnabled()) return resolve(null);
    let done = false;
    const finish = (v: (LatLng & { accuracy: number | null }) | null) => {
      if (done) return;
      done = true;
      resolve(v);
    };
    const t = setTimeout(() => finish(null), timeoutMs);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        clearTimeout(t);
        finish({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: Number.isFinite(pos.coords.accuracy) ? Math.round(pos.coords.accuracy) : null });
      },
      () => {
        clearTimeout(t);
        finish(null);
      },
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 60000 }
    );
  });
}
