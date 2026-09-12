"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Plus,
  UserPlus,
  AlertTriangle,
  Swords,
  Boxes,
  ClipboardList,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { useToast } from "@/components/ui/toast";
import { queueVisit, queueForm, isOnline, isNetworkError, OFFLINE_SAVED_MSG } from "@/lib/offline";
import { cn } from "@/lib/utils";
import { formatTRDate } from "@/lib/week";
import { visitCode } from "@/lib/codes";
import {
  answerIsComplete,
  missingRequired,
  conditionalSkip,
  contactRequired as contactRequiredRule,
} from "@/lib/visit-questions";
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  SUPPLY_KIND_LABELS,
  type CompanyKind,
  type ContactRole,
  type VisitType,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer, CompanyContact } from "@/types/db";
import {
  saveVisit,
  setVisitContact,
  saveVisitProducts,
  upsertContact,
  addCustomBrand,
  recordVisitMetric,
} from "@/app/(app)/ziyaret/actions";

export type BrandOption = { brandId: string; name: string; isOwn: boolean };
export type CategoryOption = { id: string; label_tr: string; brands: BrandOption[] };

type CatSel = { brands: string[]; supply: "" | "own_production" | "export" };
type StepDef =
  | { kind: "addons" }
  | { kind: "question"; q: QuestionWithOptions }
  | { kind: "contact" }
  | { kind: "products" }
  | { kind: "photos" }
  | { kind: "quick" };

type WizardMode = "hizli" | "detayli";
const MODE_KEY = "dayson:visit-mode";

/** Codes that get a dedicated step; everything else renders as an extra question. */
const HANDLED_CODES = new Set([
  "ziyaret_amaci",
  "hiz_veren_bayi",
  "serbest_not",
  "gorusulen_kisi_rolu", // answered through the contact step
]);

export function VisitWizard({
  visitId,
  isOwner,
  companyId,
  companyName = "",
  companyKind,
  visitType,
  visitDate,
  questions,
  existingAnswers,
  categories,
  existingProducts,
  previousProducts = {},
  contacts,
  currentContactId,
  initialCompleted,
  addonSurveys = [],
  extraSlot,
  stepHints = {},
}: {
  visitId: string;
  isOwner: boolean;
  companyId: string;
  companyName?: string;
  companyKind: CompanyKind;
  visitType: VisitType;
  /** YYYY-MM-DD — carried into the offline queue payload. */
  visitDate: string;
  questions: QuestionWithOptions[];
  existingAnswers: VisitAnswer[];
  categories: CategoryOption[];
  existingProducts: {
    category_id: string;
    brand_id: string | null;
    supply_kind: string;
  }[];
  /** What the company's previous completed visit recorded per category
   *  (category id → labels + visit date) — shown as a hint only. */
  previousProducts?: Record<string, { date: string; labels: string[] }>;
  contacts: CompanyContact[];
  currentContactId: string | null;
  initialCompleted: boolean;
  /** Surveys that target this company — offered as add-ons. */
  addonSurveys?: { id: string; name: string }[];
  /** Rendered inside the notes step (e.g. the photo uploader). */
  extraSlot?: React.ReactNode;
  /** Info line shown above a question step, keyed by question code
   *  (e.g. "Hedefin gerisinde" on the next-action step). */
  stepHints?: Partial<Record<string, string>>;
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [autosaveWarn, setAutosaveWarn] = useState(false);
  // Guards the warning against out-of-order autosave results: only the most
  // recently started save may set/clear it.
  const autosaveSeq = useRef(0);
  // Set by saveAll when the save went to the offline queue instead of the server.
  const queuedRef = useRef(false);
  const stepKey = `visit-step:${visitId}`;
  const [step, setStep] = useState(0);
  // Hızlı mod (default): every required field on one screen. Detaylı mod is
  // the classic step-by-step wizard. The choice is remembered on the device.
  const [mode, setMode] = useState<WizardMode>("hizli");
  useEffect(() => {
    try {
      if (localStorage.getItem(MODE_KEY) === "detayli") setMode("detayli");
    } catch {
      /* storage unavailable */
    }
  }, []);
  function switchMode() {
    const next: WizardMode = mode === "hizli" ? "detayli" : "hizli";
    setMode(next);
    setStep(0);
    setMissingId(null);
    try {
      localStorage.setItem(MODE_KEY, next);
    } catch {
      /* ignore */
    }
  }
  // Which required field blocked completion (highlighted in quick mode).
  const [missingId, setMissingId] = useState<string | null>(null);
  // Reporting metric: seconds the screen was visible + voice usage.
  const activeSec = useRef(0);
  const voiceChars = useRef(0);
  useEffect(() => {
    if (!isOwner) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") activeSec.current += 1;
    }, 1000);
    return () => clearInterval(t);
  }, [isOwner]);
  function flushMetric(completed: boolean) {
    const input = {
      visitId,
      secondsActive: activeSec.current,
      mode,
      voiceUsed: voiceChars.current > 0,
      voiceChars: voiceChars.current,
      completed,
    };
    activeSec.current = 0;
    voiceChars.current = 0;
    if (!isOnline()) {
      void queueForm("metrik", "Rapor süresi", input).catch(() => undefined);
      return;
    }
    void recordVisitMetric(input).catch(() => queueForm("metrik", "Rapor süresi", input).catch(() => undefined));
  }

  // Resume where the rep left off (drafts only) — the step index lives on the
  // device, never in the DB.
  useEffect(() => {
    if (!isOwner || initialCompleted) return;
    try {
      const saved = Number(localStorage.getItem(stepKey));
      if (Number.isFinite(saved) && saved > 0) setStep(saved);
    } catch {
      /* storage unavailable */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!isOwner || initialCompleted) return;
    try {
      localStorage.setItem(stepKey, String(step));
    } catch {
      /* ignore */
    }
  }, [step, stepKey, isOwner, initialCompleted]);

  const byCode = useMemo(() => {
    const m = new Map<string, QuestionWithOptions>();
    for (const q of questions) m.set(q.code, q);
    return m;
  }, [questions]);

  // Catalog answers keyed by question id (string values, mirroring visit-form).
  const [values, setValues] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const a of existingAnswers) {
      init[a.question_id] =
        a.value_text ??
        (a.value_number != null ? String(a.value_number) : null) ??
        a.value_date ??
        "";
    }
    return init;
  });
  const setVal = (qid: string, v: string) =>
    setValues((p) => ({ ...p, [qid]: v }));

  // Free-text detail for "Diğer" answers.
  const [details, setDetails] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const a of existingAnswers)
      if (a.value_detail) init[a.question_id] = a.value_detail;
    return init;
  });
  const setDetail = (qid: string, v: string) =>
    setDetails((p) => ({ ...p, [qid]: v }));

  // Contacts
  const [contactList, setContactList] = useState<CompanyContact[]>(contacts);
  const [contactId, setContactId] = useState<string | null>(currentContactId);
  const [newName, setNewName] = useState("");
  const [newPhone, setNewPhone] = useState("");
  const [newRole, setNewRole] = useState("");

  // Products
  const [catOptions, setCatOptions] = useState<CategoryOption[]>(categories);
  const [productSel, setProductSel] = useState<Record<string, CatSel>>(() => {
    const init: Record<string, CatSel> = {};
    for (const c of categories) init[c.id] = { brands: [], supply: "" };
    for (const p of existingProducts) {
      const s = init[p.category_id] ?? { brands: [], supply: "" };
      if (p.supply_kind === "brand" && p.brand_id) s.brands.push(p.brand_id);
      else if (p.supply_kind === "own_production") s.supply = "own_production";
      else if (p.supply_kind === "export") s.supply = "export";
      init[p.category_id] = s;
    }
    return init;
  });
  const [customName, setCustomName] = useState<Record<string, string>>({});

  const skipConditional = useMemo(
    () => conditionalSkip(byCode, values),
    [byCode, values]
  );

  // Step order (spec K1): ekle → amaç → kişi → ürünler →
  // hizmet veren bayi (alt bayi / potansiyel) → ek sorular → not.
  // Every applicable question except the contact-role one (answered via the
  // contact step) and the conditional skip — the quick screen renders these.
  const activeQuestions = useMemo(
    () => questions.filter((q) => q.code !== "gorusulen_kisi_rolu" && !skipConditional(q)),
    [questions, skipConditional]
  );
  const steps = useMemo<StepDef[]>(() => {
    if (mode === "hizli") return [{ kind: "quick" }];
    const out: StepDef[] = [];
    out.push({ kind: "addons" });
    const amac = byCode.get("ziyaret_amaci");
    if (amac) out.push({ kind: "question", q: amac });
    out.push({ kind: "contact" });
    // Product matrix on every visit (phone included) whenever a catalog exists.
    if (catOptions.length > 0) out.push({ kind: "products" });
    // Which kinds get "hizmet veren bayi" is decided by the question's
    // applies_to_kind (the questions prop is already filtered) — the same rule
    // the server applies, so a required step can never be hidden here.
    const hiz = byCode.get("hiz_veren_bayi");
    if (hiz) out.push({ kind: "question", q: hiz });
    for (const q of questions) {
      if (HANDLED_CODES.has(q.code)) continue;
      if (skipConditional(q)) continue;
      out.push({ kind: "question", q });
    }
    const notes = byCode.get("serbest_not");
    if (notes) out.push({ kind: "question", q: notes });
    // "Serbest not" can be deactivated by the office; keep the photo uploader.
    else if (extraSlot) out.push({ kind: "photos" });
    return out;
  }, [mode, byCode, catOptions.length, questions, skipConditional, extraSlot]);

  const total = steps.length;
  // A conditional question can vanish mid-flow — never point past the end.
  useEffect(() => {
    if (step > total - 1) setStep(Math.max(0, total - 1));
  }, [step, total]);
  const current = steps[Math.min(step, total - 1)];

  const contactRequired = contactRequiredRule(questions);

  /** Whether the CURRENT step allows moving on ("Devam" stays disabled). */
  function stepValid(s: StepDef | undefined): boolean {
    if (!s) return true;
    if (s.kind === "question")
      return !s.q.is_required || answerIsComplete(s.q, values[s.q.id], details[s.q.id]);
    if (s.kind === "contact") return !contactRequired || contactId != null;
    return true;
  }
  const currentValid = stepValid(current);

  function toggleBrand(catId: string, brandId: string) {
    setProductSel((p) => {
      const s = p[catId] ?? { brands: [], supply: "" };
      const has = s.brands.includes(brandId);
      return {
        ...p,
        [catId]: {
          ...s,
          brands: has
            ? s.brands.filter((b) => b !== brandId)
            : [...s.brands, brandId],
        },
      };
    });
  }
  function setSupply(catId: string, supply: CatSel["supply"]) {
    setProductSel((p) => ({
      ...p,
      [catId]: { ...(p[catId] ?? { brands: [], supply: "" }), supply },
    }));
  }

  function addOther(catId: string) {
    const name = (customName[catId] ?? "").trim();
    if (!name) return;
    startTransition(async () => {
      const res = await addCustomBrand({ categoryId: catId, name });
      if (res.error || !res.brandId) {
        setError(res.error ?? "Marka eklenemedi.");
        return;
      }
      const brandId = res.brandId;
      setCatOptions((opts) =>
        opts.map((c) =>
          c.id === catId && !c.brands.some((b) => b.brandId === brandId)
            ? { ...c, brands: [...c.brands, { brandId, name, isOwn: false }] }
            : c
        )
      );
      setProductSel((p) => {
        const s = p[catId] ?? { brands: [], supply: "" };
        return s.brands.includes(brandId)
          ? p
          : { ...p, [catId]: { ...s, brands: [...s.brands, brandId] } };
      });
      setCustomName((p) => ({ ...p, [catId]: "" }));
    });
  }

  function saveNewContact() {
    if (!newName.trim()) return;
    setError(null);
    startTransition(async () => {
      const res = await upsertContact({
        companyId,
        name: newName,
        phone: newPhone,
        role: newRole || null,
      });
      if (res.error || !res.id) {
        setError(res.error ?? "Kişi eklenemedi.");
        return;
      }
      const c: CompanyContact = {
        id: res.id,
        company_id: companyId,
        name: newName.trim(),
        phone: newPhone.trim() || null,
        role: newRole || null,
        created_by: null,
        created_at: "",
        updated_at: "",
      };
      setContactList((l) => [c, ...l]);
      setContactId(res.id);
      setNewName("");
      setNewPhone("");
      setNewRole("");
    });
  }

  function buildAnswers() {
    return questions.map((q) => {
      const raw = values[q.id] ?? "";
      if (q.input_type === "number")
        return { questionId: q.id, valueNumber: raw === "" ? null : Number(raw) };
      if (q.input_type === "date")
        return { questionId: q.id, valueDate: raw === "" ? null : raw };
      const detail =
        raw.split(",").map((s) => s.trim()).includes("diger")
          ? details[q.id]?.trim() || null
          : null;
      return {
        questionId: q.id,
        valueText: raw === "" ? null : raw,
        valueDetail: detail,
      };
    });
  }

  function buildProductSelections() {
    const sel: Array<{
      categoryId: string;
      brandId?: string | null;
      supplyKind?: "brand" | "own_production" | "export";
    }> = [];
    for (const [catId, s] of Object.entries(productSel)) {
      for (const brandId of s.brands)
        sel.push({ categoryId: catId, brandId, supplyKind: "brand" });
      if (s.supply)
        sel.push({ categoryId: catId, supplyKind: s.supply });
    }
    return sel;
  }

  function persist(complete: boolean) {
    setError(null);
    if (complete) {
      // Same rules as the server: every rendered required question must be
      // complete. Jump back to the first gap instead of failing silently.
      const rendered =
        mode === "hizli" ? activeQuestions : steps.flatMap((s) => (s.kind === "question" ? [s.q] : []));
      const missing = missingRequired(rendered, values, details, skipConditional);
      if (missing) {
        if (mode === "hizli") {
          setMissingId(missing.id);
          document.getElementById(`q-${missing.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else {
          const idx = steps.findIndex((s) => s.kind === "question" && s.q.id === missing.id);
          if (idx >= 0) setStep(idx);
        }
        setError(`"${missing.label_tr}" alanı zorunludur — devam etmek için bu alanı doldur.`);
        return;
      }
      if (contactRequired && contactId == null) {
        if (mode === "hizli") {
          setMissingId("contact");
          document.getElementById("q-contact")?.scrollIntoView({ behavior: "smooth", block: "center" });
        } else setStep(steps.findIndex((s) => s.kind === "contact"));
        setError("Görüşülen kişi zorunludur.");
        return;
      }
      setMissingId(null);
    }
    startTransition(async () => {
      const err = await saveAll(complete);
      if (err) return setError(err);
      flushMetric(complete);
      autosaveSeq.current++; // a stale in-flight autosave may not re-warn
      setAutosaveWarn(false);
      if (queuedRef.current) {
        queuedRef.current = false;
        toast(OFFLINE_SAVED_MSG, "info");
        if (complete) {
          try {
            localStorage.removeItem(stepKey);
          } catch {
            /* ignore */
          }
          router.push("/");
        }
        return;
      }
      if (complete) {
        try {
          localStorage.removeItem(stepKey);
        } catch {
          /* ignore */
        }
        const code = visitCode(visitId);
        toast(`Ziyaret tamamlandı · ${code}`);
        router.push(`/?done=${code}`);
        router.refresh();
      } else {
        toast("Taslak kaydedildi", "info");
        router.refresh();
      }
    });
  }

  /** Save everything; returns an error message or null. Never throws — a
   *  dropped connection must not silently escape startTransition. */
  async function saveAll(complete: boolean): Promise<string | null> {
    const queueOffline = async () => {
      try {
        await queueVisit(`Ziyaret · ${companyName}`, {
          visitId,
          create: false,
          companyId,
          visitType,
          visitDate,
          answers: buildAnswers(),
          selections: buildProductSelections(),
          contactId,
          complete,
        });
        queuedRef.current = true;
        return null;
      } catch {
        return "Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin. Girdikleriniz bu ekranda duruyor.";
      }
    };
    if (!isOnline()) return queueOffline();
    try {
      const p1 = await saveVisitProducts({
        visitId,
        selections: buildProductSelections(),
      });
      if (p1.error) return p1.error;
      const p2 = await setVisitContact({ visitId, contactId });
      if (p2.error) return p2.error;
      const p3 = await saveVisit({
        visitId,
        answers: buildAnswers(),
        complete,
      });
      if (p3.error) return p3.error;
      return null;
    } catch (e) {
      if (isNetworkError(e)) return queueOffline();
      return "Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin. Girdikleriniz bu ekranda duruyor.";
    }
  }

  /** Advance a step and autosave in the background, so a killed PWA or dead
   *  battery doesn't lose everything typed so far. Completed visits are never
   *  autosaved: saveVisit(false) would demote them to draft and wipe
   *  completed_at just for paging through. */
  function goNext() {
    if (!currentValid) {
      setError("Devam etmek için bu adımı doldur.");
      return;
    }
    setError(null);
    setStep((s) => Math.min(total - 1, s + 1));
    if (!isOwner || initialCompleted) return;
    const seq = ++autosaveSeq.current;
    void saveAll(false).then((err) => {
      if (seq === autosaveSeq.current) setAutosaveWarn(err != null);
    });
  }

  const renderAddons = () => (
            <div className="space-y-3">
              <Label>Bu ziyarete rapor eklemek ister misin?</Label>
              <p className="text-xs text-muted-foreground">
                İstersen şimdi ekle; ziyaretin sonunda da ekleyebilirsin.
              </p>
              <div className="grid grid-cols-2 gap-3">
                {companyKind === "distributor" && (
                  <Link href={`/sikayet/yeni?${addonQuery}`}>
                    <Button variant="outline" className="h-16 w-full flex-col gap-1">
                      <AlertTriangle className="h-5 w-5 text-amber-600" />
                      Şikayet ekle
                    </Button>
                  </Link>
                )}
                <Link href={`/rakip/yeni?${addonQuery}`}>
                  <Button variant="outline" className="h-16 w-full flex-col gap-1">
                    <Swords className="h-5 w-5 text-primary" />
                    Rakip bilgisi
                  </Button>
                </Link>
                {companyKind === "distributor" && (
                  <Link href={`/stok/yeni?${addonQuery}`}>
                    <Button variant="outline" className="h-16 w-full flex-col gap-1">
                      <Boxes className="h-5 w-5 text-primary" />
                      Stok durumu
                    </Button>
                  </Link>
                )}
                {addonSurveys.map((s) => (
                  <Link key={s.id} href={`/anket/${s.id}?${addonQuery}`}>
                    <Button variant="outline" className="h-16 w-full flex-col gap-1">
                      <ClipboardList className="h-5 w-5 text-primary" />
                      <span className="line-clamp-2 text-xs">Özel rapor · {s.name}</span>
                    </Button>
                  </Link>
                ))}
              </div>
            </div>
  );

  const renderContact = () => (
            <div className="space-y-3">
              <Label>
                Görüşülen kişi
                {contactRequired && <span className="text-destructive"> *</span>}
              </Label>
              {contactList.length > 0 && (
                <div className="space-y-2">
                  {contactList.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() =>
                        setContactId(contactId === c.id ? null : c.id)
                      }
                      className={cn(
                        "flex w-full items-center justify-between rounded-md border p-3 text-left",
                        contactId === c.id
                          ? "border-primary bg-primary/5"
                          : "hover:bg-accent"
                      )}
                    >
                      <div>
                        <div className="font-medium">{c.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {[
                            c.phone,
                            c.role
                              ? CONTACT_ROLE_LABELS[c.role as ContactRole] ??
                                c.role
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ") || "—"}
                        </div>
                      </div>
                      {contactId === c.id && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </button>
                  ))}
                </div>
              )}
              {contactList.length === 0 && (
                <p className="text-sm text-muted-foreground">Kayıtlı kişi yok.</p>
              )}

              <div className="rounded-md border p-3">
                <div className="mb-2 flex items-center gap-2 text-sm font-medium">
                  <UserPlus className="h-4 w-4" /> Yeni kişi
                </div>
                <div className="space-y-2">
                  <Input
                    placeholder="Adı"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                  />
                  <Input
                    type="tel"
                    inputMode="tel"
                    placeholder="Telefon"
                    value={newPhone}
                    onChange={(e) => setNewPhone(e.target.value)}
                  />
                  <Select
                    value={newRole}
                    onChange={(e) => setNewRole(e.target.value)}
                  >
                    <option value="">Görevi (opsiyonel)</option>
                    {CONTACT_ROLES.map((r) => (
                      <option key={r} value={r}>
                        {CONTACT_ROLE_LABELS[r]}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    className="w-full"
                    disabled={pending || !newName.trim()}
                    onClick={saveNewContact}
                  >
                    <Plus className="mr-1 h-4 w-4" /> Kişiyi kaydet ve seç
                  </Button>
                </div>
              </div>
            </div>
  );

  const renderProducts = () => (
            <div className="space-y-4">
              <Label>Raf Bilgisi</Label>
              {catOptions.map((c) => {
                const s = productSel[c.id] ?? { brands: [], supply: "" };
                const prev = previousProducts[c.id];
                return (
                  <div key={c.id} className="rounded-md border p-3">
                    <div className={prev ? "font-medium" : "mb-2 font-medium"}>{c.label_tr}</div>
                    {prev && (
                      <p className="mb-2 text-xs text-muted-foreground">
                        Son raf bilgisi ({formatTRDate(prev.date)}): {prev.labels.join(", ")}
                      </p>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {c.brands.map((b) => {
                        const on = s.brands.includes(b.brandId);
                        return (
                          <button
                            key={b.brandId}
                            type="button"
                            onClick={() => toggleBrand(c.id, b.brandId)}
                            className={cn(
                              "rounded-full border px-3 py-1 text-sm",
                              on
                                ? "border-primary bg-primary text-primary-foreground"
                                : b.isOwn
                                  ? "border-primary/40 text-primary hover:bg-accent"
                                  : "hover:bg-accent"
                            )}
                          >
                            {b.name}
                          </button>
                        );
                      })}
                    </div>

                    <div className="mt-2 flex gap-2">
                      <Input
                        placeholder="Diğer marka…"
                        value={customName[c.id] ?? ""}
                        onChange={(e) =>
                          setCustomName((p) => ({ ...p, [c.id]: e.target.value }))
                        }
                        className="h-9"
                      />
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        disabled={pending || !(customName[c.id] ?? "").trim()}
                        onClick={() => addOther(c.id)}
                      >
                        Ekle
                      </Button>
                    </div>

                    <div className="mt-2">
                      <Select
                        value={s.supply}
                        onChange={(e) =>
                          setSupply(c.id, e.target.value as CatSel["supply"])
                        }
                        className="h-9"
                      >
                        <option value="">Kendi üretimi / İhracat (yok)</option>
                        <option value="own_production">
                          {SUPPLY_KIND_LABELS.own_production}
                        </option>
                        <option value="export">
                          {SUPPLY_KIND_LABELS.export}
                        </option>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
  );

  const notesQ = byCode.get("serbest_not") ?? null;
  const questionBlock = (q: QuestionWithOptions) => (
    <div
      key={q.id}
      id={`q-${q.id}`}
      className={cn("rounded-md", missingId === q.id && "ring-2 ring-destructive ring-offset-2")}
    >
      {stepHints[q.code] && (
        <p className="mb-3 rounded-md border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold-soft))] p-2.5 text-sm text-[hsl(var(--gold))]">
          {stepHints[q.code]}
        </p>
      )}
      <QuestionStep
        q={q}
        value={values[q.id] ?? ""}
        onChange={(v) => {
          setVal(q.id, v);
          if (missingId === q.id) setMissingId(null);
        }}
        detail={details[q.id] ?? ""}
        onDetailChange={(v) => setDetail(q.id, v)}
        extra={q.code === "serbest_not" ? extraSlot : undefined}
      />
    </div>
  );

  const renderQuick = () => {
    const required = activeQuestions.filter((q) => q.is_required && q.code !== "serbest_not");
    const optional = activeQuestions.filter((q) => !q.is_required && q.code !== "serbest_not");
    return (
      <div className="space-y-6">
        {required.map(questionBlock)}
        <div
          id="q-contact"
          className={cn("rounded-md", missingId === "contact" && "ring-2 ring-destructive ring-offset-2")}
        >
          {renderContact()}
        </div>
        {notesQ ? questionBlock(notesQ) : extraSlot}
        <details className="rounded-md border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            Detay ekle
            <span className="ml-1 font-normal text-muted-foreground">
              (raf bilgisi, isteğe bağlı sorular, şikayet / rakip / stok)
            </span>
          </summary>
          <div className="mt-4 space-y-6">
            {renderAddons()}
            {catOptions.length > 0 && renderProducts()}
            {optional.map(questionBlock)}
          </div>
        </details>
      </div>
    );
  };

  const isLast = step >= total - 1;
  const addonQuery = `company=${companyId}&visit=${visitId}&return=${encodeURIComponent(
    `/ziyaret/${visitId}`
  )}`;

  return (
    <div className="space-y-4">
      {/* Mode + progress */}
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{mode === "hizli" ? "Hızlı mod: zorunlu alanlar tek ekranda" : `Adım ${step + 1} / ${total}`}</span>
        {isOwner && (
          <button type="button" className="underline" onClick={switchMode}>
            {mode === "hizli" ? "Detaylı moda geç" : "Hızlı moda geç"}
          </button>
        )}
      </div>
      <div className={cn("flex items-center gap-1", mode === "hizli" && "hidden")}>
        {steps.map((_, i) => (
          <div
            key={i}
            className={cn(
              "h-1.5 flex-1 rounded-full",
              i <= step ? "bg-primary" : "bg-muted"
            )}
          />
        ))}
      </div>
      <Card>
        <CardContent className="space-y-4 p-4">
          {current?.kind === "quick" && renderQuick()}

          {current?.kind === "addons" && renderAddons()}

          {current?.kind === "question" && stepHints[current.q.code] && (
            <p className="mb-3 rounded-md border border-[hsl(var(--gold))]/40 bg-[hsl(var(--gold-soft))] p-2.5 text-sm text-[hsl(var(--gold))]">
              {stepHints[current.q.code]}
            </p>
          )}
          {current?.kind === "question" && (
            <QuestionStep
              q={current.q}
              value={values[current.q.id] ?? ""}
              onChange={(v) => setVal(current.q.id, v)}
              detail={details[current.q.id] ?? ""}
              onDetailChange={(v) => setDetail(current.q.id, v)}
              extra={current.q.code === "serbest_not" ? extraSlot : undefined}
            />
          )}

          {current?.kind === "contact" && renderContact()}

          {current?.kind === "photos" && <div className="space-y-3">{extraSlot}</div>}

          {current?.kind === "products" && renderProducts()}

          {error && <p className="text-sm text-destructive">{error}</p>}
        </CardContent>
      </Card>

      {!isOwner && (
        <p className="text-xs text-muted-foreground">
          Bu ziyaret başka bir pazarlamacıya ait — yalnızca görüntüleme.
        </p>
      )}

      {autosaveWarn && (
        <p className="text-xs text-amber-600">
          Otomatik kayıt başarısız — bağlantınızı kontrol edin. Cevaplarınız bu
          ekranda duruyor; sonraki adımda veya kaydettiğinizde yeniden denenir.
        </p>
      )}

      {/* Navigation */}
      <div className="flex items-center gap-2">
        {mode !== "hizli" && (
          <Button
            variant="outline"
            disabled={pending || step === 0}
            onClick={() => setStep((s) => Math.max(0, s - 1))}
          >
            <ArrowLeft className="mr-1 h-4 w-4" /> Geri
          </Button>
        )}
        {isOwner && (
          <Button
            variant="ghost"
            disabled={pending}
            onClick={() => persist(false)}
          >
            Taslak kaydet
          </Button>
        )}
        {isLast ? (
          isOwner && (
            <Button
              className="ml-auto"
              disabled={pending}
              onClick={() => persist(true)}
            >
              <Check className="mr-1 h-4 w-4" />
              {initialCompleted ? "Güncelle" : "Tamamla"}
            </Button>
          )
        ) : (
          <Button
            className="ml-auto"
            disabled={pending || !currentValid}
            title={currentValid ? undefined : "Devam etmek için bu adımı doldur"}
            onClick={goNext}
          >
            İleri <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
      {!currentValid && !error && (
        <p className="text-xs text-muted-foreground">
          Devam etmek için bu adımı doldur.
        </p>
      )}
    </div>
  );
}

function QuestionStep({
  q,
  value,
  onChange,
  detail,
  onDetailChange,
  extra,
}: {
  q: QuestionWithOptions;
  value: string;
  onChange: (v: string) => void;
  detail: string;
  onDetailChange: (v: string) => void;
  extra?: React.ReactNode;
}) {
  const isSelect =
    q.input_type === "select" || q.input_type === "multiselect";
  const isMulti = q.input_type === "multiselect";
  const picks = value ? value.split(",").map((s) => s.trim()).filter(Boolean) : [];
  const hasDiger = picks.includes("diger");

  function toggleOption(v: string) {
    if (!isMulti) {
      onChange(value === v ? "" : v);
      return;
    }
    const next = picks.includes(v) ? picks.filter((p) => p !== v) : [...picks, v];
    onChange(next.join(","));
  }

  return (
    <div className="space-y-1.5">
      <Label htmlFor={q.id}>
        {q.label_tr}
        {q.is_required && <span className="text-destructive"> *</span>}
      </Label>
      {q.input_type === "boolean" && (
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: "evet", l: "Evet" },
            { v: "hayir", l: "Hayır" },
          ].map((o) => (
            <button
              key={o.v}
              type="button"
              onClick={() => onChange(value === o.v ? "" : o.v)}
              className={cn(
                "rounded-md border px-3 py-3 text-sm font-medium",
                value === o.v
                  ? "border-primary bg-primary text-primary-foreground"
                  : "hover:bg-accent"
              )}
            >
              {o.l}
            </button>
          ))}
        </div>
      )}
      {isSelect && (
        <div className="flex flex-wrap gap-2">
          {[...q.question_options]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((o) => {
              const on = picks.includes(o.value);
              return (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => toggleOption(o.value)}
                  className={cn(
                    "rounded-full border px-4 py-2 text-sm",
                    on
                      ? "border-primary bg-primary text-primary-foreground"
                      : "hover:bg-accent"
                  )}
                >
                  {o.label_tr}
                </button>
              );
            })}
        </div>
      )}
      {q.input_type === "number" && (
        <Input
          id={q.id}
          type="number"
          inputMode="decimal"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {q.input_type === "date" && (
        <Input
          id={q.id}
          type="date"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {q.input_type === "text" && (
        <Textarea
          id={q.id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          rows={q.code === "serbest_not" ? 5 : 3}
          placeholder={
            q.code === "serbest_not"
              ? "Görüşme özeti, sözler, dikkat edilecekler"
              : undefined
          }
        />
      )}
      {isSelect && hasDiger && (
        <div className="space-y-1">
          <Input
            placeholder="Açıklama yazın… *"
            value={detail}
            onChange={(e) => onDetailChange(e.target.value)}
          />
          {!detail.trim() && (
            <p className="text-xs text-muted-foreground">
              &quot;Diğer&quot; seçildiğinde açıklama zorunludur.
            </p>
          )}
        </div>
      )}
      {extra}
    </div>
  );
}
