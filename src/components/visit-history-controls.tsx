"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

type SP = { id: string; full_name: string };

/**
 * Salesperson filter + company search for the manager visit-history page.
 * Both update the URL query string (server re-queries); search is debounced.
 */
export function VisitHistoryControls({
  salespeople,
  initialSp,
  initialQuery,
}: {
  salespeople: SP[];
  initialSp: string;
  initialQuery: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = useState(initialQuery);

  function setParam(key: string, value: string) {
    const next = new URLSearchParams(params.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.push(`${pathname}?${next.toString()}`);
  }

  // Debounce the free-text company search.
  useEffect(() => {
    if (q === initialQuery) return;
    const t = setTimeout(() => setParam("q", q.trim()), 350);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  return (
    <div className="flex flex-col gap-2 sm:flex-row">
      <Select
        value={initialSp}
        onChange={(e) => setParam("sp", e.target.value)}
        className="sm:w-56"
      >
        <option value="">Tüm pazarlamacılar</option>
        {salespeople.map((sp) => (
          <option key={sp.id} value={sp.id}>
            {sp.full_name}
          </option>
        ))}
      </Select>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Firma ara…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="pl-9"
        />
      </div>
    </div>
  );
}
