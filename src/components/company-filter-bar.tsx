"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { COMPANY_SORTS } from "@/lib/companies/list";

type SP = { id: string; full_name: string };
type Region = { value: string; label: string };

/**
 * Manager company-list controls: debounced name search, salesperson, region
 * (plate / city) and sort. Everything lives in the URL so the list, the row
 * links and Önceki / Sıradaki all agree.
 */
export function CompanyFilterBar({
  salespeople,
  regions,
  initial,
}: {
  salespeople: SP[];
  regions: Region[];
  initial: { q: string; sp: string; bolge: string; sirala: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initial.q);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    const s = next.toString();
    router.push(s ? `${pathname}?${s}` : pathname);
  }

  useEffect(() => {
    if (q === initial.q) return;
    const t = setTimeout(() => setParam("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input placeholder="Firma ara…" value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
      </div>
      <Select value={initial.sp} onChange={(e) => setParam("sp", e.target.value)}>
        <option value="">Tüm pazarlamacılar</option>
        {salespeople.map((sp) => (
          <option key={sp.id} value={sp.id}>
            {sp.full_name}
          </option>
        ))}
      </Select>
      <Select value={initial.bolge} onChange={(e) => setParam("bolge", e.target.value)}>
        <option value="">Tüm şehirler</option>
        {regions.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </Select>
      <Select value={initial.sirala} onChange={(e) => setParam("sirala", e.target.value === "ad" ? "" : e.target.value)}>
        {COMPANY_SORTS.map((s) => (
          <option key={s.key} value={s.key}>
            Sıralama: {s.label}
            {s.key === "ziyaret" ? " (en eski önce)" : ""}
          </option>
        ))}
      </Select>
    </div>
  );
}
