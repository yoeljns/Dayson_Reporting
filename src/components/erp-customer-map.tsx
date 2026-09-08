"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Link2Off, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CompanyPicker, type PickedCompany } from "@/components/company-picker";
import { useToast } from "@/components/ui/toast";
import { fmtEur } from "@/lib/rules/target";
import { mapErpCustomer } from "@/app/(admin)/admin/sevkiyat/actions";

export type UnmatchedCustomer = {
  cariName: string;
  koli: number;
  eur: number;
  suggestion: PickedCompany | null;
};
export type MatchedCustomer = { cariName: string; company: PickedCompany };

/** Map ERP customer names to companies; the mapping is remembered for later uploads. */
export function ErpCustomerMap({
  unmatched,
  matched,
}: {
  unmatched: UnmatchedCustomer[];
  matched: MatchedCustomer[];
}) {
  const router = useRouter();
  const { toast } = useToast();
  const [pending, startTransition] = useTransition();
  const [picked, setPicked] = useState<Record<string, PickedCompany | null>>(() => {
    const m: Record<string, PickedCompany | null> = {};
    for (const u of unmatched) m[u.cariName] = u.suggestion;
    return m;
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [editPick, setEditPick] = useState<PickedCompany | null>(null);

  function save(cariName: string, company: PickedCompany | null) {
    startTransition(async () => {
      const res = await mapErpCustomer({ cariName, companyId: company?.id ?? null });
      if (res.error) {
        toast(res.error, "warn");
        return;
      }
      toast(company ? `${cariName} → ${company.name}` : "Eşleme kaldırıldı", "ok");
      setEditing(null);
      setEditPick(null);
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="section-label">Eşleşmeyen müşteriler ({unmatched.length})</div>
        {unmatched.length === 0 ? (
          <p className="text-sm text-muted-foreground">Tüm müşteri adları bir firmayla eşleşti.</p>
        ) : (
          <ul className="space-y-2">
            {unmatched.map((u) => (
              <li key={u.cariName} className="rounded-md border p-3">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <span className="font-medium">{u.cariName}</span>
                  <span className="text-xs text-muted-foreground tabular-nums">
                    {u.koli.toLocaleString("tr-TR", { maximumFractionDigits: 1 })} koli · {fmtEur(u.eur)}
                  </span>
                </div>
                <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
                  <div className="flex-1">
                    <CompanyPicker
                      value={picked[u.cariName] ?? null}
                      onChange={(c) => setPicked((p) => ({ ...p, [u.cariName]: c }))}
                      minChars={2}
                      allowCreate
                    />
                    {u.suggestion && picked[u.cariName]?.id === u.suggestion.id && (
                      <p className="mt-1 text-xs text-muted-foreground">Ada göre öneri — doğruysa Eşle&apos;ye basın.</p>
                    )}
                  </div>
                  <Button
                    size="sm"
                    disabled={pending || !picked[u.cariName]}
                    onClick={() => save(u.cariName, picked[u.cariName] ?? null)}
                  >
                    <Check className="mr-1 h-4 w-4" /> Eşle
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="space-y-2">
        <div className="section-label">Eşleşmiş müşteriler ({matched.length})</div>
        {matched.length === 0 ? (
          <p className="text-sm text-muted-foreground">Henüz eşleme yok.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <th className="py-1.5 pr-2">Logo cari adı</th>
                  <th className="py-1.5 pr-2">Firma</th>
                  <th className="py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {matched.map((m) => (
                  <tr key={m.cariName} className="border-b align-top last:border-0">
                    <td className="py-1.5 pr-2">{m.cariName}</td>
                    <td className="py-1.5 pr-2">
                      {editing === m.cariName ? (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-start">
                          <div className="flex-1">
                            <CompanyPicker value={editPick} onChange={setEditPick} minChars={2} allowCreate />
                          </div>
                          <Button size="sm" disabled={pending || !editPick} onClick={() => save(m.cariName, editPick)}>
                            Kaydet
                          </Button>
                          <Button size="sm" variant="ghost" disabled={pending} onClick={() => setEditing(null)}>
                            Vazgeç
                          </Button>
                        </div>
                      ) : (
                        m.company.name
                      )}
                    </td>
                    <td className="py-1.5 text-right">
                      {editing !== m.cariName && (
                        <div className="flex justify-end gap-1">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title="Değiştir"
                            disabled={pending}
                            onClick={() => {
                              setEditing(m.cariName);
                              setEditPick(m.company);
                            }}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-destructive"
                            title="Eşlemeyi kaldır"
                            disabled={pending}
                            onClick={() => save(m.cariName, null)}
                          >
                            <Link2Off className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
