"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { MapPin, Crosshair, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { mapsUrl, type LatLng } from "@/lib/geo";
import { getPosition } from "@/lib/geo-client";
import { formatTRDate } from "@/lib/week";
import { setCompanyLocation, clearCompanyLocation } from "@/app/(admin)/admin/bayiler/actions";

/** Manager view of a company's pin: open in maps, take from this device, clear. */
export function CompanyLocation({
  companyId,
  location,
  source,
  locatedAt,
}: {
  companyId: string;
  location: LatLng | null;
  source: string | null;
  locatedAt: string | null;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);

  async function fromDevice() {
    setBusy(true);
    const pos = await getPosition(10000);
    setBusy(false);
    if (!pos) return toast("Konum alınamadı", "warn");
    startTransition(async () => {
      const res = await setCompanyLocation({ companyId, lat: pos.lat, lng: pos.lng });
      if (res.error) return toast(res.error, "warn");
      toast("Firma konumu güncellendi", "ok");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 text-sm print:hidden">
      <MapPin className="h-4 w-4 text-muted-foreground" />
      {location ? (
        <>
          <a href={mapsUrl(location)} target="_blank" rel="noopener noreferrer" className="underline">
            Haritada aç
          </a>
          <span className="text-xs text-muted-foreground">
            {source === "first_visit" ? "ilk ziyaretten" : "elle"}
            {locatedAt ? ` · ${formatTRDate(locatedAt.slice(0, 10))}` : ""}
          </span>
        </>
      ) : (
        <span className="text-muted-foreground">Konum yok — ilk yüz yüze ziyarette öğrenilir.</span>
      )}
      <Button size="sm" variant="ghost" disabled={pending || busy} onClick={fromDevice} title="Bu cihazın konumunu firma konumu yap">
        <Crosshair className="mr-1 h-3.5 w-3.5" /> Buradan al
      </Button>
      {location && (
        <Button
          size="sm"
          variant="ghost"
          className="text-destructive"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const res = await clearCompanyLocation({ companyId });
              if (res.error) return toast(res.error, "warn");
              router.refresh();
            })
          }
        >
          <Trash2 className="mr-1 h-3.5 w-3.5" /> Sıfırla
        </Button>
      )}
    </div>
  );
}
