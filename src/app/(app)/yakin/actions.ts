"use server";

import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { distanceMeters, validLatLng } from "@/lib/geo";

export type NearbyCompany = { id: string; name: string; kind: string; distance: number };

/** Companies (visible to the caller) within 3 km of the device, nearest first. */
export async function nearbyCompanies(input: { lat: number; lng: number }): Promise<{ items?: NearbyCompany[]; error?: string }> {
  await requireProfile();
  const here = validLatLng(input.lat, input.lng);
  if (!here) return { error: "Geçersiz konum." };
  const supabase = createClient();
  const { data } = await supabase
    .from("companies")
    .select("id, name, kind, lat, lng")
    .not("lat", "is", null)
    .is("deleted_at", null)
    .limit(5000);
  const items = ((data as { id: string; name: string; kind: string; lat: number; lng: number }[] | null) ?? [])
    .map((c) => ({ id: c.id, name: c.name, kind: c.kind, distance: distanceMeters(here, { lat: c.lat, lng: c.lng }) }))
    .filter((c) => c.distance <= 3000)
    .sort((a, b) => a.distance - b.distance)
    .slice(0, 3);
  return { items };
}
