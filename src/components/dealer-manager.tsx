"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ConfirmButton } from "@/components/confirm-button";
import { DEBT_STATUS_LABELS, type DebtStatus } from "@/lib/enums";
import { assignDealer, deleteCompany } from "@/app/(admin)/admin/bayiler/actions";

type Dealer = {
  id: string;
  name: string;
  logo_code: string | null;
  segment: string | null;
  debt_status: string | null;
  city: string | null;
  assignedTo: string | null;
};

type SP = { id: string; full_name: string };

export function DealerManager({
  dealers,
  salespeople,
}: {
  dealers: Dealer[];
  salespeople: SP[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [term, setTerm] = useState("");

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    if (!t) return dealers;
    return dealers.filter(
      (d) =>
        d.name.toLowerCase().includes(t) ||
        (d.logo_code ?? "").toLowerCase().includes(t)
    );
  }, [term, dealers]);

  function reassign(companyId: string, salespersonId: string) {
    startTransition(async () => {
      await assignDealer({
        companyId,
        salespersonId: salespersonId || null,
      });
      router.refresh();
    });
  }

  async function remove(companyId: string) {
    const res = await deleteCompany({ companyId });
    if (res.error) return;
    router.refresh();
  }

  return (
    <div className="space-y-4">
      <Input
        placeholder="Bayi ara (isim / logo kodu)…"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <p className="text-sm text-muted-foreground">
        {filtered.length} bayi
      </p>
      <div className="space-y-2">
        {filtered.map((d) => (
          <Card key={d.id}>
            <CardContent className="flex flex-wrap items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="font-medium">
                  <Link
                    href={`/admin/bayi/${d.id}`}
                    className="hover:underline"
                  >
                    {d.name}
                  </Link>{" "}
                  {d.segment && (
                    <Badge variant="secondary">{d.segment}</Badge>
                  )}{" "}
                  {d.debt_status && (
                    <Badge variant="outline">
                      {DEBT_STATUS_LABELS[d.debt_status as DebtStatus] ??
                        d.debt_status}
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground">
                  {[d.logo_code, d.city].filter(Boolean).join(" · ") || "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Select
                  value={d.assignedTo ?? ""}
                  onChange={(e) => reassign(d.id, e.target.value)}
                  disabled={pending}
                  className="h-9 w-auto"
                >
                  <option value="">— Atanmamış —</option>
                  {salespeople.map((sp) => (
                    <option key={sp.id} value={sp.id}>
                      {sp.full_name}
                    </option>
                  ))}
                </Select>
                <ConfirmButton
                  variant="ghost"
                  size="icon"
                  className="text-destructive"
                  title="Sil"
                  message={`"${d.name}" silinsin mi? Geçmiş ziyaret/şikayet kayıtları olan firmalar arşivlenir (kayıtlar korunur).`}
                  confirmText="Sil"
                  onConfirm={() => remove(d.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </ConfirmButton>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
