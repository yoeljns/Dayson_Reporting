"use client";

import { useState, useTransition } from "react";
import { Mic, Square, Wand2, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { useSpeech } from "@/lib/voice/speech";
import { parseTranscript, type DraftCompetitor, type VoiceDictionary, type VoiceDraft } from "@/lib/voice/parse-tr";
import { newId } from "@/lib/uuid";
import { cn } from "@/lib/utils";
import { queueForm, isOnline, isNetworkError, OFFLINE_SAVED_MSG } from "@/lib/offline";
import { saveObservation } from "@/app/(app)/rakip/actions";
import { saveComplaint } from "@/app/(app)/sikayet/actions";
import { saveStockCount } from "@/app/(app)/stok/actions";
import { rememberAlias } from "@/app/(app)/sesli/actions";

/**
 * "Konuşarak doldur": free Turkish speech → transcript (editable) → rule
 * parser → the visit form is filled through `onApply`, and the extra records
 * it found (competitor prices, complaints, stock) are offered as cards that
 * save through the existing actions. Nothing is recorded; only text.
 */
export function VoiceReport({
  dict,
  today,
  companyId,
  visitId,
  isDealer,
  onApply,
  onChars,
}: {
  dict: VoiceDictionary;
  today: string;
  companyId: string;
  visitId: string;
  isDealer: boolean;
  onApply: (d: VoiceDraft) => void;
  onChars: (n: number) => void;
}) {
  const { toast } = useToast();
  const [text, setText] = useState("");
  const { supported, listening, interim, error, start, stop } = useSpeech({
    onFinal: (t) => {
      onChars(t.length);
      setText((p) => (p ? `${p} ${t}` : t));
    },
  });
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [comps, setComps] = useState<(DraftCompetitor & { key: string; saved: boolean; remember: boolean })[]>([]);
  const [complaints, setComplaints] = useState<{ key: string; description: string; saved: boolean }[]>([]);
  const [stock, setStock] = useState<{ skuId: string; label: string; pallets: string }[]>([]);
  const [stockSaved, setStockSaved] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!supported) return null;

  function analyse() {
    const d = parseTranscript(text, dict, { today });
    setDraft(d);
    setComps(d.competitors.map((c) => ({ ...c, key: newId(), saved: false, remember: false })));
    setComplaints(d.complaints.map((c) => ({ key: newId(), description: c.description, saved: false })));
    setStock(isDealer ? d.stock.map((s) => ({ skuId: s.skuId, label: s.label, pallets: String(s.pallets) })) : []);
    setStockSaved(false);
    onApply(d);
    toast(d.filled.length > 0 ? `${d.filled.length} alan dolduruldu` : "Alan bulunamadı, metin nota eklendi", d.filled.length ? "ok" : "info");
  }

  function saveComp(c: (typeof comps)[number]) {
    if (!c.competitorId) return toast("Rakip seçin", "warn");
    const input = {
      clientId: newId(),
      competitorId: c.competitorId,
      competitorProductId: c.productId,
      companyId,
      visitId,
      productName: c.productName || "Ürün",
      observedPrice: c.price,
      priceIncludesVat: c.vat,
      note: "Sesli rapor",
      extras: {},
      observedAt: today,
      isDraft: false,
    };
    startTransition(async () => {
      const done = () => setComps((p) => p.map((x) => (x.key === c.key ? { ...x, saved: true } : x)));
      if (c.remember && c.heard) {
        void rememberAlias({ heard: c.heard, kind: "competitor", targetId: c.competitorId!, targetLabel: c.competitorName });
      }
      if (!isOnline()) {
        await queueForm("rakip", `Rakip bilgisi · ${c.competitorName}`, input);
        toast(OFFLINE_SAVED_MSG, "info");
        done();
        return;
      }
      try {
        const res = await saveObservation(input);
        if (res.error) return toast(res.error, "warn");
        toast("Rakip bilgisi kaydedildi", "ok");
        done();
      } catch (e) {
        if (isNetworkError(e)) {
          await queueForm("rakip", `Rakip bilgisi · ${c.competitorName}`, input);
          toast(OFFLINE_SAVED_MSG, "info");
          done();
        } else toast("Kaydedilemedi", "warn");
      }
    });
  }

  function saveCompl(c: (typeof complaints)[number]) {
    if (!c.description.trim()) return toast("Açıklama yazın", "warn");
    const input = { clientId: newId(), companyId, visitId, description: c.description.trim(), detectedAt: today, extras: {}, isDraft: false };
    startTransition(async () => {
      const done = () => setComplaints((p) => p.map((x) => (x.key === c.key ? { ...x, saved: true } : x)));
      if (!isOnline()) {
        await queueForm("sikayet", "Şikayet (sesli)", input);
        toast(OFFLINE_SAVED_MSG, "info");
        done();
        return;
      }
      try {
        const res = await saveComplaint(input);
        if (res.error) return toast(res.error, "warn");
        toast("Şikayet kaydedildi", "ok");
        done();
      } catch (e) {
        if (isNetworkError(e)) {
          await queueForm("sikayet", "Şikayet (sesli)", input);
          toast(OFFLINE_SAVED_MSG, "info");
          done();
        } else toast("Kaydedilemedi", "warn");
      }
    });
  }

  function saveStock() {
    const lines = stock.map((s) => ({ skuId: s.skuId, pallets: Number(String(s.pallets).replace(",", ".")) || 0 })).filter((l) => l.pallets > 0);
    if (lines.length === 0) return toast("Palet sayısı girin", "warn");
    const input = { id: newId(), companyId, visitId, countedAt: today, note: "Sesli rapor", extras: {}, lines };
    startTransition(async () => {
      if (!isOnline()) {
        await queueForm("stok", "Stok sayımı (sesli)", input);
        toast(OFFLINE_SAVED_MSG, "info");
        setStockSaved(true);
        return;
      }
      try {
        const res = await saveStockCount(input);
        if (res.error) return toast(res.error, "warn");
        toast("Stok sayımı kaydedildi", "ok");
        setStockSaved(true);
      } catch (e) {
        if (isNetworkError(e)) {
          await queueForm("stok", "Stok sayımı (sesli)", input);
          toast(OFFLINE_SAVED_MSG, "info");
          setStockSaved(true);
        } else toast("Kaydedilemedi", "warn");
      }
    });
  }

  return (
    <Card className="border-primary/40">
      <CardContent className="space-y-3 pt-4">
        <div className="flex items-center justify-between">
          <div className="text-sm font-medium">Konuşarak doldur</div>
          <span className="text-xs text-muted-foreground">Ücretsiz · ses kaydedilmez</span>
        </div>
        <Button
          type="button"
          size="lg"
          variant={listening ? "destructive" : "default"}
          className="h-14 w-full text-base"
          onClick={listening ? stop : start}
        >
          {listening ? <Square className="mr-2 h-5 w-5" /> : <Mic className="mr-2 h-5 w-5" />}
          {listening ? "Durdur" : text ? "Devam et" : "Konuşmaya başla"}
        </Button>
        {listening && (
          <p className="text-sm text-muted-foreground">
            Dinliyor… <span className="italic">{interim}</span>
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {!listening && !text && (
          <p className="text-xs text-muted-foreground">
            Örnek: &quot;Ahmet Bey&apos;le görüştüm, sipariş aldık, mastikte Dayson ve Sista var, rakip Sista 280 ml 810 lira KDV
            hariç, şikayet: teslimat gecikti, stokta 4 palet extra beyaz, haftaya tekrar geleceğim.&quot;
          </p>
        )}
        {text && (
          <>
            <Textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} className="text-sm" />
            <div className="flex gap-2">
              <Button type="button" className="flex-1" disabled={listening || pending} onClick={analyse}>
                <Wand2 className="mr-2 h-4 w-4" /> Alanlara doldur
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={listening || pending}
                onClick={() => {
                  setText("");
                  setDraft(null);
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}

        {draft && (
          <div className="space-y-3">
            {draft.filled.length > 0 && (
              <div className="rounded-md border border-emerald-300 bg-emerald-50 p-2.5 text-sm dark:bg-emerald-950/30">
                <div className="mb-1 text-xs font-medium text-emerald-800 dark:text-emerald-300">Dolduruldu — kontrol edip düzeltin</div>
                <ul className="list-disc space-y-0.5 pl-4">
                  {draft.filled.map((f, i) => (
                    <li key={i}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            {draft.unmatched.length > 0 && (
              <div className="rounded-md border border-amber-300 bg-amber-50 p-2.5 text-xs dark:bg-amber-950/30">
                <span className="font-medium">Anlaşılamayan: </span>
                {draft.unmatched.join(" · ")}
              </div>
            )}

            {comps.map((c) => (
              <div key={c.key} className={cn("space-y-2 rounded-md border p-3", c.saved && "opacity-60")}>
                <div className="flex items-center justify-between text-sm font-medium">
                  Rakip bilgisi
                  {c.saved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> kaydedildi
                    </span>
                  )}
                </div>
                <Select
                  value={c.competitorId ?? ""}
                  disabled={c.saved}
                  onChange={(e) => {
                    const id = e.target.value || null;
                    const name = dict.competitors.find((x) => x.id === id)?.label ?? c.competitorName;
                    setComps((p) => p.map((x) => (x.key === c.key ? { ...x, competitorId: id, competitorName: name, productId: null } : x)));
                  }}
                >
                  <option value="">Rakip seçin</option>
                  {dict.competitors.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </Select>
                <Input
                  placeholder="Ürün"
                  value={c.productName}
                  disabled={c.saved}
                  onChange={(e) => setComps((p) => p.map((x) => (x.key === c.key ? { ...x, productName: e.target.value } : x)))}
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Input
                    type="number"
                    inputMode="decimal"
                    placeholder="Fiyat"
                    className="w-28"
                    value={c.price ?? ""}
                    disabled={c.saved}
                    onChange={(e) =>
                      setComps((p) => p.map((x) => (x.key === c.key ? { ...x, price: e.target.value === "" ? null : Number(e.target.value) } : x)))
                    }
                  />
                  {([
                    [true, "KDV dahil"],
                    [false, "KDV hariç"],
                    [null, "Bilinmiyor"],
                  ] as [boolean | null, string][]).map(([v, l]) => (
                    <button
                      key={l}
                      type="button"
                      disabled={c.saved}
                      onClick={() => setComps((p) => p.map((x) => (x.key === c.key ? { ...x, vat: v } : x)))}
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-xs",
                        c.vat === v ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
                      )}
                    >
                      {l}
                    </button>
                  ))}
                </div>
                {c.heard && !c.saved && (
                  <label className="flex items-center gap-2 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={c.remember}
                      onChange={(e) => setComps((p) => p.map((x) => (x.key === c.key ? { ...x, remember: e.target.checked } : x)))}
                    />
                    &quot;{c.heard}&quot; söyleyişini bu rakip olarak hatırla
                  </label>
                )}
                {!c.saved && (
                  <Button type="button" size="sm" disabled={pending} onClick={() => saveComp(c)}>
                    Rakip bilgisini kaydet
                  </Button>
                )}
              </div>
            ))}

            {complaints.map((c) => (
              <div key={c.key} className={cn("space-y-2 rounded-md border p-3", c.saved && "opacity-60")}>
                <div className="flex items-center justify-between text-sm font-medium">
                  Şikayet
                  {c.saved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> kaydedildi
                    </span>
                  )}
                </div>
                <Textarea
                  rows={2}
                  value={c.description}
                  disabled={c.saved}
                  onChange={(e) => setComplaints((p) => p.map((x) => (x.key === c.key ? { ...x, description: e.target.value } : x)))}
                />
                {!c.saved && (
                  <Button type="button" size="sm" disabled={pending} onClick={() => saveCompl(c)}>
                    Şikayeti kaydet
                  </Button>
                )}
              </div>
            ))}

            {stock.length > 0 && (
              <div className={cn("space-y-2 rounded-md border p-3", stockSaved && "opacity-60")}>
                <div className="flex items-center justify-between text-sm font-medium">
                  Stok sayımı
                  {stockSaved && (
                    <span className="flex items-center gap-1 text-xs text-emerald-700">
                      <Check className="h-3.5 w-3.5" /> kaydedildi
                    </span>
                  )}
                </div>
                {stock.map((s, i) => (
                  <div key={`${s.skuId}-${i}`} className="flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{s.label}</span>
                    <Input
                      type="number"
                      inputMode="decimal"
                      step={0.5}
                      className="w-20 text-right"
                      value={s.pallets}
                      disabled={stockSaved}
                      onChange={(e) => setStock((p) => p.map((x, j) => (j === i ? { ...x, pallets: e.target.value } : x)))}
                    />
                    <Label className="text-xs text-muted-foreground">palet</Label>
                  </div>
                ))}
                {!stockSaved && (
                  <Button type="button" size="sm" disabled={pending} onClick={saveStock}>
                    Stok sayımını kaydet
                  </Button>
                )}
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
