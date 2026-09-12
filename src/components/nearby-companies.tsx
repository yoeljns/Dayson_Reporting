"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MapPin, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { fmtDistance } from "@/lib/geo";
import { geoDecided, geoEnabled, getPosition, setGeoEnabled } from "@/lib/geo-client";
import { nearbyCompanies, type NearbyCompany } from "@/app/(app)/yakin/actions";

/** "Yakınında" card on the rep home: nearest companies with a one-tap start. */
export function NearbyCompanies() {
  const [state, setState] = useState<"init" | "ask" | "loading" | "ready" | "off">("init");
  const [items, setItems] = useState<NearbyCompany[]>([]);

  async function locate() {
    setState("loading");
    const pos = await getPosition(8000);
    if (!pos) {
      setState("off");
      return;
    }
    const res = await nearbyCompanies({ lat: pos.lat, lng: pos.lng });
    setItems(res.items ?? []);
    setState("ready");
  }

  useEffect(() => {
    if (!geoDecided()) setState("ask");
    else if (geoEnabled()) void locate();
    else setState("off");
  }, []);

  if (state === "off" || state === "init") return null;
  if (state === "ask") {
    return (
      <Card>
        <CardContent className="flex items-center justify-between gap-3 py-3">
          <p className="text-sm text-muted-foreground">
            Yakınındaki firmayı gösterip ziyareti tek dokunuşla başlatalım mı? Konum yalnızca ziyaret tamamlanırken
            kaydedilir.
          </p>
          <div className="flex shrink-0 gap-1">
            <Button
              size="sm"
              onClick={() => {
                setGeoEnabled(true);
                void locate();
              }}
            >
              <MapPin className="mr-1 h-4 w-4" /> Aç
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setGeoEnabled(false);
                setState("off");
              }}
            >
              Hayır
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  if (state === "ready" && items.length === 0) return null;
  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <CardTitle className="section-label flex items-center gap-2">
          <MapPin className="h-3.5 w-3.5" /> Yakınında
        </CardTitle>
        {state === "loading" && <span className="text-xs text-muted-foreground">konum alınıyor…</span>}
      </CardHeader>
      {state === "ready" && (
        <CardContent className="space-y-2">
          {items.map((c) => (
            <div key={c.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
              <div className="min-w-0">
                <div className="truncate font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground">{fmtDistance(c.distance)}</div>
              </div>
              <Link href={`/ziyaret/yeni?company=${c.id}&quick=1`}>
                <Button size="sm">
                  <Play className="mr-1 h-3.5 w-3.5" /> Başlat
                </Button>
              </Link>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}
