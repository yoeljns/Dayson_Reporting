"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { geoEnabled, setGeoEnabled } from "@/lib/geo-client";

/** Device-level switch for location features (nearby suggestion, visit position). */
export function GeoConsentToggle() {
  const [on, setOn] = useState(true);
  useEffect(() => setOn(geoEnabled()), []);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-sm">{on ? "Konum özellikleri açık" : "Konum özellikleri kapalı"}</span>
      <Button
        size="sm"
        variant={on ? "outline" : "default"}
        onClick={() => {
          setGeoEnabled(!on);
          setOn(!on);
        }}
      >
        {on ? "Kapat" : "Aç"}
      </Button>
    </div>
  );
}
