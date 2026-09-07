"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, X, ArrowUpRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { CompanySearch } from "@/components/company-search";
import { useToast } from "@/components/ui/toast";
import {
  COMPANY_KINDS,
  COMPANY_KIND_LABELS,
  SEGMENTS,
  DEBT_STATUSES,
  DEBT_STATUS_LABELS,
  type CompanyKind,
} from "@/lib/enums";
import { updateCompanyMeta, convertToDealer } from "@/app/(admin)/admin/bayiler/actions";

export type CompanyRowData = {
  id: string;
  name: string;
  kind: CompanyKind;
  city: string | null;
  plate_code: string | null;
  phone: string | null;
  buys_from_company_id: string | null;
  buysFromName: string | null;
};

/** Inline editor for a company's type / plate / phone / supplier dealer. */
export function CompanyRowEditor({ company }: { company: CompanyRowData }) {
  const router = useRouter();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [convert, setConvert] = useState(false);
  const [pending, startTransition] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [name, setName] = useState(company.name);
  const [kind, setKind] = useState<CompanyKind>(company.kind);
  const [city, setCity] = useState(company.city ?? "");
  const [plate, setPlate] = useState(company.plate_code ?? "");
  const [phone, setPhone] = useState(company.phone ?? "");
  const [buysFrom, setBuysFrom] = useState<{ id: string; name: string } | null>(
    company.buys_from_company_id
      ? { id: company.buys_from_company_id, name: company.buysFromName ?? "Bayi" }
      : null
  );
  const [pickDealer, setPickDealer] = useState(false);
  const [logoCode, setLogoCode] = useState("");
  const [segment, setSegment] = useState("");
  const [debt, setDebt] = useState("");

  function run(fn: () => Promise<{ error?: string }>, okMsg: string) {
    setErr(null);
    startTransition(async () => {
      const r = await fn();
      if (r.error) {
        setErr(r.error);
        return;
      }
      toast(okMsg, "ok");
      setOpen(false);
      setConvert(false);
      router.refresh();
    });
  }

  if (!open)
    return (
      <Button
        variant="ghost"
        size="icon"
        title="Düzenle"
        onClick={() => setOpen(true)}
      >
        <Pencil className="h-4 w-4" />
      </Button>
    );

  return (
    <div className="w-full space-y-2 rounded-md border bg-muted/20 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Firma bilgileri</span>
        <button type="button" onClick={() => setOpen(false)} className="text-muted-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Ad</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Tür</Label>
          <Select value={kind} onChange={(e) => setKind(e.target.value as CompanyKind)}>
            {COMPANY_KINDS.map((k) => (
              <option key={k} value={k}>
                {COMPANY_KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
        <div className="space-y-1">
          <Label>Telefon</Label>
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>İl</Label>
          <Input value={city} onChange={(e) => setCity(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Plaka</Label>
          <Input
            inputMode="numeric"
            maxLength={2}
            value={plate}
            onChange={(e) => setPlate(e.target.value.replace(/\D/g, "").slice(0, 2))}
          />
        </div>
        {kind !== "distributor" && (
          <div className="space-y-1 sm:col-span-2">
            <Label>Hangi bayi üzerinden alıyor?</Label>
            {buysFrom ? (
              <div className="flex items-center justify-between rounded-md border p-2 text-sm">
                <span>{buysFrom.name}</span>
                <button type="button" onClick={() => setBuysFrom(null)}>
                  <X className="h-4 w-4 text-muted-foreground" />
                </button>
              </div>
            ) : pickDealer ? (
              <div className="rounded-md border p-2">
                <CompanySearch
                  kind="distributor"
                  minChars={2}
                  onSelect={(c) => {
                    setBuysFrom({ id: c.id, name: c.name });
                    setPickDealer(false);
                  }}
                />
              </div>
            ) : (
              <Button type="button" variant="outline" size="sm" onClick={() => setPickDealer(true)}>
                Bayi seç
              </Button>
            )}
          </div>
        )}
      </div>
      {err && <p className="text-sm text-destructive">{err}</p>}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            run(
              () =>
                updateCompanyMeta({
                  companyId: company.id,
                  name,
                  kind,
                  city,
                  plateCode: plate,
                  phone,
                  buysFromCompanyId: kind === "distributor" ? null : buysFrom?.id ?? null,
                }),
              "Firma güncellendi"
            )
          }
        >
          Kaydet
        </Button>
        {company.kind === "non_customer" && !convert && (
          <Button size="sm" variant="outline" onClick={() => setConvert(true)}>
            <ArrowUpRight className="mr-1 h-4 w-4" /> Bayiye dönüştür
          </Button>
        )}
      </div>
      {convert && (
        <div className="space-y-2 rounded-md border bg-card p-2">
          <div className="text-sm font-medium">Bayiye dönüştür</div>
          <div className="grid gap-2 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>Logo kodu</Label>
              <Input value={logoCode} onChange={(e) => setLogoCode(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Segment</Label>
              <Select value={segment} onChange={(e) => setSegment(e.target.value)}>
                <option value="">—</option>
                {SEGMENTS.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Borç durumu</Label>
              <Select value={debt} onChange={(e) => setDebt(e.target.value)}>
                <option value="">—</option>
                {DEBT_STATUSES.map((d) => (
                  <option key={d} value={d}>
                    {DEBT_STATUS_LABELS[d]}
                  </option>
                ))}
              </Select>
            </div>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setConvert(false)}>
              Vazgeç
            </Button>
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                run(
                  () =>
                    convertToDealer({
                      companyId: company.id,
                      logoCode,
                      segment: segment || null,
                      debtStatus: debt || null,
                    }),
                  "Firma bayiye dönüştürüldü"
                )
              }
            >
              Dönüştür
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
