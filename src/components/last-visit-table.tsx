"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowDownUp, Building2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { formatTRDate, daysSince } from "@/lib/week";

export type LastVisitRow = {
  companyId: string;
  name: string;
  city: string | null;
  segment: string | null;
  salesperson?: string | null;
  lastVisit: string | null;
  visitCount: number;
};

type Sort = "stale" | "name";

export function LastVisitTable({
  rows,
  showSalesperson = false,
  linkBase,
  linkMode = "query",
}: {
  rows: LastVisitRow[];
  showSalesperson?: boolean;
  /** When set, each row links to `${linkBase}?company=<id>` (visit history). */
  linkBase?: string;
  /** "dealer" links to `${linkBase}/<id>` instead — the dealer file page. */
  linkMode?: "query" | "dealer";
}) {
  const [term, setTerm] = useState("");
  const [sort, setSort] = useState<Sort>("stale");

  const filtered = useMemo(() => {
    const t = term.trim().toLowerCase();
    let list = rows;
    if (t) {
      list = rows.filter(
        (r) =>
          r.name.toLowerCase().includes(t) ||
          (r.city ?? "").toLowerCase().includes(t) ||
          (r.salesperson ?? "").toLowerCase().includes(t)
      );
    }
    const sorted = [...list];
    if (sort === "name") {
      sorted.sort((a, b) => a.name.localeCompare(b.name, "tr"));
    } else {
      // Stalest first: never-visited (null) at the very top, then oldest dates.
      sorted.sort((a, b) => {
        if (a.lastVisit === b.lastVisit) return a.name.localeCompare(b.name, "tr");
        if (!a.lastVisit) return -1;
        if (!b.lastVisit) return 1;
        return a.lastVisit < b.lastVisit ? -1 : 1;
      });
    }
    return sorted;
  }, [rows, term, sort]);

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <Input
          placeholder="Firma / şehir ara…"
          value={term}
          onChange={(e) => setTerm(e.target.value)}
        />
        <button
          type="button"
          onClick={() => setSort((s) => (s === "stale" ? "name" : "stale"))}
          className="flex shrink-0 items-center gap-1 rounded-md border px-3 text-sm hover:bg-accent"
          title="Sıralama"
        >
          <ArrowDownUp className="h-4 w-4" />
          {sort === "stale" ? "En eski" : "İsim"}
        </button>
      </div>

      <p className="text-sm text-muted-foreground">{filtered.length} firma</p>

      <div className="space-y-2">
        {filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            Firma bulunamadı.
          </p>
        ) : (
          filtered.map((r) => {
            const days = daysSince(r.lastVisit);
            const card = (
              <Card
                key={r.companyId}
                className={linkBase ? "transition-colors hover:bg-accent" : undefined}
              >
                <CardContent className="flex items-center justify-between gap-2 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <Building2 className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span>{r.name}</span>
                      {r.segment && <Badge variant="secondary">{r.segment}</Badge>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {[
                        r.city,
                        showSalesperson ? r.salesperson ?? "Atanmamış" : null,
                      ]
                        .filter(Boolean)
                        .join(" · ") || "—"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div
                      className={cn(
                        "text-sm font-medium",
                        !r.lastVisit && "text-destructive"
                      )}
                    >
                      {r.lastVisit ? formatTRDate(r.lastVisit) : "Hiç"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {days == null
                        ? "ziyaret yok"
                        : days === 0
                          ? "bugün"
                          : `${days} gün önce`}
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
            return linkBase ? (
              <Link
                key={r.companyId}
                href={
                  linkMode === "dealer"
                    ? `${linkBase}/${encodeURIComponent(r.companyId)}`
                    : `${linkBase}?company=${encodeURIComponent(r.companyId)}`
                }
                className="block"
              >
                {card}
              </Link>
            ) : (
              card
            );
          })
        )}
      </div>
    </div>
  );
}
