"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Mic, Square, Check, RotateCcw, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { useSpeech, speechSupported } from "@/lib/voice/speech";
import { speak, ttsSupported } from "@/lib/voice/tts";
import { parseTranscript, type VoiceDictionary, type VoiceDraft } from "@/lib/voice/parse-tr";
import { findLabel, norm, tokens } from "@/lib/voice/text";
import { nameKey } from "@/lib/sales/mapping";
import { newId } from "@/lib/uuid";
import { cn } from "@/lib/utils";
import { queueVisit, queueForm, isOnline, isNetworkError } from "@/lib/offline";
import { createDraftVisit, saveVisit, saveVisitProducts } from "@/app/(app)/ziyaret/actions";
import { saveObservation } from "@/app/(app)/rakip/actions";
import { saveComplaint } from "@/app/(app)/sikayet/actions";
import { saveStockCount } from "@/app/(app)/stok/actions";

type Company = { id: string; name: string; kind: string };
type Phase = "idle" | "listening" | "review" | "saving" | "done";

const SILENCE_MS = 4500;

/**
 * Hands-free voice notes. Flow: tap Dinle → say "Karsel Boya için …" →
 * after a pause the app reads back what it understood → say "onayla" (or
 * "iptal" / "tekrar") → a draft visit with the answers is created for the
 * chosen company; finish it at the next stop. No reading or tapping needed
 * while driving.
 */
export function DrivingMode({
  dict,
  today,
  plan,
  companies,
}: {
  dict: VoiceDictionary;
  today: string;
  plan: Company[];
  companies: Company[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [phase, setPhase] = useState<Phase>("idle");
  const [company, setCompany] = useState<Company | null>(null);
  const [text, setText] = useState("");
  const [draft, setDraft] = useState<VoiceDraft | null>(null);
  const [log, setLog] = useState<string[]>([]);
  const phaseRef = useRef<Phase>("idle");
  phaseRef.current = phase;
  const companyRef = useRef<Company | null>(null);
  companyRef.current = company;
  const textRef = useRef("");
  const silenceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wakeLock = useRef<{ release: () => Promise<void> } | null>(null);
  const [supported, setSupported] = useState(true);

  const say = useCallback((s: string) => {
    setLog((l) => [...l.slice(-6), s]);
    return speak(s);
  }, []);

  const speech = useSpeech({
    onFinal: (t) => {
      if (phaseRef.current === "review") {
        handleCommand(t);
        return;
      }
      if (phaseRef.current !== "listening") return;
      // "X için" / "X'teyim" at the start picks the company.
      if (!companyRef.current) {
        const c = matchCompany(t);
        if (c) {
          setCompany(c);
          companyRef.current = c;
          void say(`Firma: ${c.name}. Devam edin.`);
          const rest = stripCompany(t, c);
          if (rest) textRef.current = textRef.current ? `${textRef.current} ${rest}` : rest;
          setText(textRef.current);
          armSilence();
          return;
        }
      }
      textRef.current = textRef.current ? `${textRef.current} ${t}` : t;
      setText(textRef.current);
      armSilence();
    },
  });
  const { start, stop, listening, interim, error } = speech;

  useEffect(() => {
    setSupported(speechSupported() && ttsSupported());
  }, []);

  function matchCompany(t: string): Company | null {
    const toks = tokens(t);
    if (toks.length === 0) return null;
    let best: { c: Company; score: number } | null = null;
    for (const c of [...plan, ...companies]) {
      const key = nameKey(c.name) || norm(c.name);
      const h = findLabel(toks, key, 0.72);
      if (h && (!best || h.score > best.score)) best = { c, score: h.score };
    }
    return best?.c ?? null;
  }
  function stripCompany(t: string, c: Company): string {
    const key = nameKey(c.name) || norm(c.name);
    const toks = tokens(t);
    const h = findLabel(toks, key, 0.72);
    if (!h) return t;
    const rest = [...toks.slice(0, h.start), ...toks.slice(h.end)].filter((w) => !["icin", "deyim", "deydim", "teyim", "taydim", "deyiz"].includes(w));
    return rest.join(" ");
  }

  function armSilence() {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    silenceTimer.current = setTimeout(() => void review(), SILENCE_MS);
  }

  async function review() {
    if (phaseRef.current !== "listening") return;
    const t = textRef.current.trim();
    if (!t) return;
    stop();
    if (!companyRef.current) {
      setPhase("review");
      await say("Hangi firma? Firma adını söyleyin.");
      setPhase("listening");
      start();
      armSilence();
      return;
    }
    const d = parseTranscript(t, dict, { today });
    setDraft(d);
    setPhase("review");
    const summary = d.filled.length > 0 ? d.filled.join(". ") : "yalnız not";
    await say(`${companyRef.current.name} için anladığım: ${summary}. Kaydetmek için onayla deyin, silmek için iptal.`);
    start();
  }

  function handleCommand(t: string) {
    const n = norm(t);
    if (/\b(onayla|onaylıyorum|onay|kaydet|tamam)\b/.test(n)) void commit();
    else if (/\b(iptal|sil|vazgec)\b/.test(n)) {
      textRef.current = "";
      setText("");
      setDraft(null);
      setPhase("listening");
      void say("Silindi. Devam edin.");
    } else if (/\b(tekrar|yeniden oku|bir daha)\b/.test(n)) {
      const d = draft;
      void say(d && d.filled.length ? d.filled.join(". ") : "Yalnız not alındı.");
    } else if (/firma degistir|baska firma/.test(n)) {
      setCompany(null);
      companyRef.current = null;
      setPhase("listening");
      void say("Firma adını söyleyin.");
    } else {
      // Anything else is more content.
      textRef.current = textRef.current ? `${textRef.current} ${t}` : t;
      setText(textRef.current);
      setPhase("listening");
      armSilence();
    }
  }

  async function commit() {
    const c = companyRef.current;
    const d = draft ?? parseTranscript(textRef.current, dict, { today });
    if (!c) return;
    setPhase("saving");
    stop();
    const visitId = newId();
    const notesQ = dict.questions.find((q) => q.code === "serbest_not");
    const answers = dict.questions
      .filter((q) => d.answers[q.id] || (notesQ && q.id === notesQ.id))
      .map((q) => {
        const v = q.id === notesQ?.id ? `[Araç modu] ${d.note}` : d.answers[q.id];
        if (q.input_type === "number") return { questionId: q.id, valueNumber: Number(v) || null };
        if (q.input_type === "date") return { questionId: q.id, valueDate: v };
        return { questionId: q.id, valueText: v, valueDetail: d.details[q.id] ?? null };
      });
    const selections = d.products.flatMap((p) => [
      ...p.brandIds.map((brandId) => ({ categoryId: p.categoryId, brandId, supplyKind: "brand" as const })),
      ...(p.supply ? [{ categoryId: p.categoryId, supplyKind: p.supply }] : []),
    ]);
    const extras = async () => {
      for (const k of d.competitors) {
        if (!k.competitorId) continue;
        const input = {
          clientId: newId(),
          competitorId: k.competitorId,
          competitorProductId: k.productId,
          companyId: c.id,
          visitId,
          productName: k.productName || "Ürün",
          observedPrice: k.price,
          priceIncludesVat: k.vat,
          note: "Araç modu",
          extras: {},
          observedAt: today,
          isDraft: false,
        };
        if (!isOnline()) await queueForm("rakip", `Rakip bilgisi · ${k.competitorName}`, input);
        else await saveObservation(input).catch(() => queueForm("rakip", `Rakip bilgisi · ${k.competitorName}`, input));
      }
      for (const cp of d.complaints) {
        const input = { clientId: newId(), companyId: c.id, visitId, description: cp.description, detectedAt: today, extras: {}, isDraft: false };
        if (!isOnline()) await queueForm("sikayet", "Şikayet (araç modu)", input);
        else await saveComplaint(input).catch(() => queueForm("sikayet", "Şikayet (araç modu)", input));
      }
      if (d.stock.length && c.kind === "distributor") {
        const input = { id: newId(), companyId: c.id, visitId, countedAt: today, note: "Araç modu", extras: {}, lines: d.stock.map((s) => ({ skuId: s.skuId, pallets: s.pallets })) };
        if (!isOnline()) await queueForm("stok", "Stok sayımı (araç modu)", input);
        else await saveStockCount(input).catch(() => queueForm("stok", "Stok sayımı (araç modu)", input));
      }
    };
    const queueAll = async () => {
      await queueVisit(`Ziyaret · ${c.name}`, {
        visitId,
        create: true,
        companyId: c.id,
        visitType: "yuz_yuze",
        visitDate: today,
        answers,
        selections,
        contactId: null,
        complete: false,
      });
      await extras();
    };
    try {
      if (!isOnline()) await queueAll();
      else {
        const r = await createDraftVisit({ id: visitId, companyId: c.id, visitType: "yuz_yuze", visitDate: today });
        if (r.error || !r.id) throw new Error(r.error ?? "Ziyaret açılamadı");
        if (selections.length) await saveVisitProducts({ visitId, selections });
        const s = await saveVisit({ visitId, answers, complete: false });
        if (s.error) throw new Error(s.error);
        await extras();
      }
      setPhase("done");
      await say(`Kaydedildi. ${c.name} için taslak ziyaret açıldı; mola verince tamamlayın.`);
      textRef.current = "";
      setText("");
      setDraft(null);
      setCompany(null);
      companyRef.current = null;
      setPhase("listening");
      start();
      router.refresh();
    } catch (e) {
      if (isNetworkError(e)) {
        await queueAll();
        setPhase("listening");
        await say("Bağlantı yok, kaydedildi; bağlantı gelince gönderilecek.");
        start();
      } else {
        setPhase("review");
        await say("Kaydedilemedi. Tekrar onayla deyin ya da iptal.");
        start();
        toast(e instanceof Error ? e.message : "Kaydedilemedi", "warn");
      }
    }
  }

  async function begin() {
    setPhase("listening");
    try {
      const nav = navigator as Navigator & { wakeLock?: { request: (t: "screen") => Promise<{ release: () => Promise<void> }> } };
      wakeLock.current = (await nav.wakeLock?.request("screen")) ?? null;
    } catch {
      /* not supported */
    }
    await say(company ? `Dinliyorum. ${company.name} için konuşun.` : "Dinliyorum. Önce firma adını, sonra notunuzu söyleyin.");
    start();
  }
  function end() {
    if (silenceTimer.current) clearTimeout(silenceTimer.current);
    stop();
    void wakeLock.current?.release().catch(() => undefined);
    wakeLock.current = null;
    setPhase("idle");
  }
  useEffect(() => () => end(), []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!supported) {
    return (
      <div className="rounded-md border p-4 text-sm">
        Bu tarayıcı sesli yazma / sesli okuma desteklemiyor. Android Chrome önerilir.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Car className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-lg font-semibold">Araç modu</h1>
          <p className="text-xs text-muted-foreground">Ekrana bakmadan sesli not. Ses kaydedilmez, yalnız metin.</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {plan.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setCompany(c);
              companyRef.current = c;
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm",
              company?.id === c.id ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {c.name}
          </button>
        ))}
      </div>

      <div className="rounded-md border bg-muted/30 p-3 text-center">
        <div className="text-xs text-muted-foreground">Firma</div>
        <div className="text-xl font-semibold">{company?.name ?? "— söyleyin: “Karsel Boya için …”"}</div>
      </div>

      {phase === "idle" ? (
        <Button size="lg" className="h-24 w-full text-xl" onClick={begin}>
          <Mic className="mr-3 h-8 w-8" /> Dinle
        </Button>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button
            size="lg"
            variant={listening ? "destructive" : "default"}
            className="h-24 text-lg"
            onClick={() => (listening ? stop() : start())}
          >
            {listening ? <Square className="mr-2 h-7 w-7" /> : <Mic className="mr-2 h-7 w-7" />}
            {listening ? "Durdur" : "Dinle"}
          </Button>
          <Button size="lg" variant="outline" className="h-24 text-lg" disabled={!text || phase === "saving"} onClick={() => (phase === "review" ? void commit() : void review())}>
            <Check className="mr-2 h-7 w-7" /> {phase === "review" ? "Onayla" : "Oku"}
          </Button>
          <Button
            size="lg"
            variant="ghost"
            className="h-16"
            onClick={() => {
              textRef.current = "";
              setText("");
              setDraft(null);
              setPhase("listening");
            }}
          >
            <RotateCcw className="mr-2 h-5 w-5" /> Sil
          </Button>
          <Button size="lg" variant="ghost" className="h-16" onClick={end}>
            <LogOut className="mr-2 h-5 w-5" /> Bitir
          </Button>
        </div>
      )}

      <div className="min-h-[3rem] rounded-md border p-3 text-base">
        {text || <span className="text-muted-foreground">{listening ? "Dinliyor…" : "Not burada görünür."}</span>}
        {interim && <span className="text-muted-foreground"> {interim}</span>}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
      {log.length > 0 && (
        <ul className="space-y-0.5 text-xs text-muted-foreground">
          {log.map((l, i) => (
            <li key={i}>🔈 {l}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-muted-foreground">
        Komutlar: <b>onayla</b> · <b>iptal</b> · <b>tekrar</b> · <b>firma değiştir</b>. Sessiz kalınca anladığını okur.
      </p>
    </div>
  );
}
