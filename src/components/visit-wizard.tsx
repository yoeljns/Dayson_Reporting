"use client";

import { useMemo, useRef, useState, useTransition } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import {
  CONTACT_ROLES,
  CONTACT_ROLE_LABELS,
  SUPPLY_KIND_LABELS,
  type CompanyKind,
  type ContactRole,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer, CompanyContact } from "@/types/db";
import {
  saveVisit,
  setVisitContact,
  saveVisitProducts,
  upsertContact,
  addCustomBrand,
} from "@/app/(app)/ziyaret/actions";

export type BrandOption = { brandId: string; name: string; isOwn: boolean };
export type CategoryOption = { id: string; label_tr: string; brands: BrandOption[] };

type CatSel = { brands: string[]; supply: "" | "own_production" | "export" };
type StepDef =
  | { kind: "addons" }
  | { kind: "question"; q: QuestionWithOptions }
  | { kind: "contact" }
  | { kind: "products" }
  | { kind: "order" };

const HANDLED_CODES = new Set([
  "ziyaret_amaci",
  "hiz_veren_bayi",
  "siparis_alindi",
  "siparis_alinmama_nedeni",
  "serbest_not",
  "gorusulen_kisi_rolu",
]);

export function VisitWizard({
  visitId,
  isOwner,
  companyId,
  companyKind,
  questions,
  existingAnswers,
  categories,
  existingProducts,
  contacts,
  currentContactId,
  initialCompleted,
}: {
  visitId: string;
  isOwner: boolean;
  companyId: string;
  companyKind: CompanyKind;
  questions: QuestionWithOptions[];
  existingAnswers: VisitAnswer[];
  categories: CategoryOption[];
  existingProducts: {
    category_id: string;
    brand_id: string | null;
    supply_kind: string;
  }[];
  contacts: CompanyContact[];
  currentContactId: string | null;
  initialCompleted: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [autosaveWarn, setAutosaveWarn] = useState(false);
  // Guards the warning against out-of-order autosave results: only the most
  // recently started save may set/clear it.
  const autosaveSeq = useRef(0);
  const [step, setStep] = useState(0);

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

  const steps = useMemo<StepDef[]>(() => {
    const out: StepDef[] = [];
    out.push({ kind: "addons" });
    const amac = byCode.get("ziyaret_amaci");
    if (amac) out.push({ kind: "question", q: amac });
    out.push({ kind: "contact" });
    if (catOptions.length > 0) out.push({ kind: "products" });
    const hiz = byCode.get("hiz_veren_bayi");
    if (hiz) out.push({ kind: "question", q: hiz });
    // Any extra admin-added questions not otherwise handled.
    for (const q of questions)
      if (!HANDLED_CODES.has(q.code)) out.push({ kind: "question", q });
    if (byCode.get("siparis_alindi")) out.push({ kind: "order" });
    const notes = byCode.get("serbest_not");
    if (notes) out.push({ kind: "question", q: notes });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [byCode, catOptions.length, questions]);

  const total = steps.length;
  const current = steps[Math.min(step, total - 1)];

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
      const detail = raw === "diger" ? (details[q.id]?.trim() || null) : null;
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
      // Only require questions actually shown in the wizard.
      const rendered = new Set<string>();
      for (const s of steps) if (s.kind === "question") rendered.add(s.q.id);
      const hasOrder = steps.some((s) => s.kind === "order");
      const sip = byCode.get("siparis_alindi");
      if (sip && hasOrder) rendered.add(sip.id);
      // The "sipariş alınmama nedeni" field only renders when order = Hayır.
      const neden = byCode.get("siparis_alinmama_nedeni");
      if (neden && hasOrder && sip && (values[sip.id] ?? "") === "hayir")
        rendered.add(neden.id);
      const missing = questions.find(
        (q) =>
          q.is_required &&
          rendered.has(q.id) &&
          !(values[q.id] ?? "").toString().trim()
      );
      if (missing) {
        setError(`"${missing.label_tr}" alanı zorunludur.`);
        return;
      }
    }
    startTransition(async () => {
      const err = await saveAll(complete);
      if (err) return setError(err);
      autosaveSeq.current++; // a stale in-flight autosave may not re-warn
      setAutosaveWarn(false);
      if (complete) {
        router.push("/");
        router.refresh();
      } else {
        router.refresh();
      }
    });
  }

  /** Save everything; returns an error message or null. Never throws — a
   *  dropped connection must not silently escape startTransition. */
  async function saveAll(complete: boolean): Promise<string | null> {
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
    } catch {
      return "Kaydedilemedi — internet bağlantınızı kontrol edip tekrar deneyin. Girdikleriniz bu ekranda duruyor.";
    }
  }

  /** Advance a step and autosave in the background, so a killed PWA or dead
   *  battery doesn't lose everything typed so far. Completed visits are never
   *  autosaved: saveVisit(false) would demote them to draft and wipe
   *  completed_at just for paging through. */
  function goNext() {
    setStep((s) => Math.min(total - 1, s + 1));
    if (!isOwner || initialCompleted) return;
    const seq = ++autosaveSeq.current;
    void saveAll(false).then((err) => {
      if (seq === autosaveSeq.current) setAutosaveWarn(err != null);
    });
  }

  const isLast = step >= total - 1;

  return (
    <div className="space-y-4">
      {/* Progress */}
      <div className="flex items-center gap-1">
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
      <p className="text-xs text-muted-foreground">
        Adım {step + 1} / {total}
      </p>

      <Card>
        <CardContent className="space-y-4 p-4">
          {current?.kind === "addons" && (
            <div className="space-y-3">
              <Label>Bu ziyarete eklemek ister misin?</Label>
              <p className="text-xs text-muted-foreground">
                İstersen şimdi ekle; rapor boyunca en altta da ekleyebilirsin.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Link href={`/sikayet/yeni?company=${companyId}&visit=${visitId}`}>
                  <Button variant="outline" className="h-16 w-full flex-col gap-1">
                    <AlertTriangle className="h-5 w-5 text-amber-600" />
                    Şikayet ekle
                  </Button>
                </Link>
                <Link href={`/rakip/yeni?company=${companyId}&visit=${visitId}`}>
                  <Button variant="outline" className="h-16 w-full flex-col gap-1">
                    <Swords className="h-5 w-5 text-primary" />
                    Rakip bilgisi
                  </Button>
                </Link>
              </div>
            </div>
          )}

          {current?.kind === "question" && (
            <QuestionStep
              q={current.q}
              value={values[current.q.id] ?? ""}
              onChange={(v) => setVal(current.q.id, v)}
              detail={details[current.q.id] ?? ""}
              onDetailChange={(v) => setDetail(current.q.id, v)}
            />
          )}

          {current?.kind === "contact" && (
            <div className="space-y-3">
              <Label>Görüşülen kişi</Label>
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
                    <option value="">Rol (opsiyonel)</option>
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
          )}

          {current?.kind === "products" && (
            <div className="space-y-4">
              <Label>Bu ürünleri kimden alıyor?</Label>
              {catOptions.map((c) => {
                const s = productSel[c.id] ?? { brands: [], supply: "" };
                return (
                  <div key={c.id} className="rounded-md border p-3">
                    <div className="mb-2 font-medium">{c.label_tr}</div>
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
          )}

          {current?.kind === "order" && (
            <div className="space-y-3">
              {(() => {
                const sip = byCode.get("siparis_alindi");
                const neden = byCode.get("siparis_alinmama_nedeni");
                if (!sip) return null;
                const sipVal = values[sip.id] ?? "";
                return (
                  <>
                    <div className="space-y-1.5">
                      <Label>{sip.label_tr}</Label>
                      <div className="grid grid-cols-2 gap-2">
                        {[
                          { v: "evet", l: "Evet" },
                          { v: "hayir", l: "Hayır" },
                        ].map((o) => (
                          <button
                            key={o.v}
                            type="button"
                            onClick={() =>
                              setVal(sip.id, sipVal === o.v ? "" : o.v)
                            }
                            className={cn(
                              "rounded-md border px-3 py-3 text-sm font-medium",
                              sipVal === o.v
                                ? "border-primary bg-primary text-primary-foreground"
                                : "hover:bg-accent"
                            )}
                          >
                            {o.l}
                          </button>
                        ))}
                      </div>
                    </div>
                    {neden && sipVal === "hayir" && (
                      <div className="space-y-1.5">
                        <Label>{neden.label_tr}</Label>
                        <Select
                          value={values[neden.id] ?? ""}
                          onChange={(e) => setVal(neden.id, e.target.value)}
                        >
                          <option value="">Seçiniz…</option>
                          {[...neden.question_options]
                            .sort((a, b) => a.sort_order - b.sort_order)
                            .map((o) => (
                              <option key={o.id} value={o.value}>
                                {o.label_tr}
                              </option>
                            ))}
                        </Select>
                        {(values[neden.id] ?? "") === "diger" && (
                          <Input
                            placeholder="Detay yazın…"
                            value={details[neden.id] ?? ""}
                            onChange={(e) => setDetail(neden.id, e.target.value)}
                          />
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </div>
          )}

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
        <Button
          variant="outline"
          disabled={pending || step === 0}
          onClick={() => setStep((s) => Math.max(0, s - 1))}
        >
          <ArrowLeft className="mr-1 h-4 w-4" /> Geri
        </Button>
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
          <Button className="ml-auto" disabled={pending} onClick={goNext}>
            İleri <ArrowRight className="ml-1 h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

function QuestionStep({
  q,
  value,
  onChange,
  detail,
  onDetailChange,
}: {
  q: QuestionWithOptions;
  value: string;
  onChange: (v: string) => void;
  detail: string;
  onDetailChange: (v: string) => void;
}) {
  const isSelect =
    q.input_type === "select" || q.input_type === "multiselect";
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
      {(q.input_type === "select" || q.input_type === "multiselect") && (
        <div className="flex flex-wrap gap-2">
          {[...q.question_options]
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onChange(value === o.value ? "" : o.value)}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm",
                  value === o.value
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                )}
              >
                {o.label_tr}
              </button>
            ))}
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
        <Textarea id={q.id} value={value} onChange={(e) => onChange(e.target.value)} />
      )}
      {isSelect && value === "diger" && (
        <Input
          placeholder="Detay yazın…"
          value={detail}
          onChange={(e) => onDetailChange(e.target.value)}
        />
      )}
    </div>
  );
}
