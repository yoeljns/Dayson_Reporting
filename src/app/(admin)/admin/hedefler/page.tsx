import Link from "next/link";
import { Download } from "lucide-react";
import { requireManager } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PercentBar } from "@/components/ui/percent-bar";
import { PaceBadge } from "@/components/target-view";
import { targetsForYear } from "@/lib/targets/server";
import { elapsedFractionOfYear, paceOf, sumLines, fmtEur } from "@/lib/rules/target";
import { getPaceThresholds } from "@/lib/settings";
import { todayIso } from "@/lib/week";
import { TARGET_STATUS_LABELS } from "@/lib/enums";
import { cn } from "@/lib/utils";

export default async function TargetsPage({
  searchParams,
}: {
  searchParams: { year?: string; q?: string };
}) {
  await requireManager();
  const supabase = createClient();
  const today = todayIso();
  const thisYear = Number(today.slice(0, 4));
  const year = Number(searchParams.year) || thisYear;
  const q = (searchParams.q ?? "").trim().toLocaleLowerCase("tr");

  const [{ data: dealers }, targets, thresholds] = await Promise.all([
    supabase
      .from("companies")
      .select("id, name, city, logo_code")
      .eq("kind", "distributor")
      .is("deleted_at", null)
      .order("name")
      .limit(3000),
    targetsForYear(supabase, year),
    getPaceThresholds(),
  ]);
  const elapsed = elapsedFractionOfYear(year, today);

  const rows = ((dealers as { id: string; name: string; city: string | null; logo_code: string | null }[] | null) ?? [])
    .filter((d) => !q || d.name.toLocaleLowerCase("tr").includes(q))
    .map((d) => {
      const t = targets.get(d.id) ?? null;
      const tot = t ? sumLines(t.lines) : null;
      const pace = tot ? paceOf(tot.actual_eur, tot.target_eur, elapsed, thresholds) : null;
      return { ...d, t, tot, pace };
    })
    // Targets with data first, behind-pace on top.
    .sort((a, b) => {
      const order = (p: typeof a) =>
        !p.t ? 3 : p.pace?.pace === "geride" ? 0 : p.pace?.pace === "yolunda" ? 1 : 2;
      return order(a) - order(b) || a.name.localeCompare(b.name, "tr");
    });
  const withTarget = rows.filter((r) => r.t && r.t.lines.length > 0).length;
  const behind = rows.filter((r) => r.pace?.pace === "geride").length;
  const years = [thisYear - 1, thisYear, thisYear + 1];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Hedefler</h1>
          <p className="text-sm text-muted-foreground">
            {year} yılı bayi hedefleri: {withTarget} bayide hedef var, {behind} bayi
            geride. Yılın %{Math.round(elapsed * 100)}&apos;i geçti.
          </p>
        </div>
        <Link href={`/api/admin/raporlar?type=hedef&year=${year}`}>
          <Button variant="outline" size="sm">
            <Download className="mr-1 h-4 w-4" /> Excel
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {years.map((y) => (
          <Link
            key={y}
            href={`/admin/hedefler?year=${y}`}
            className={cn(
              "rounded-full border px-3 py-1 text-sm",
              y === year ? "border-primary bg-primary text-primary-foreground" : "hover:bg-accent"
            )}
          >
            {y}
          </Link>
        ))}
        <form className="ml-auto flex gap-2">
          <input type="hidden" name="year" value={year} />
          <input
            name="q"
            defaultValue={searchParams.q ?? ""}
            placeholder="Bayi ara…"
            className="h-8 w-48 rounded-md border bg-background px-3 text-sm"
          />
          <Button type="submit" variant="secondary" size="sm">
            Ara
          </Button>
        </form>
      </div>

      <Card>
        <CardContent className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40 text-left text-xs text-muted-foreground">
                <th className="px-3 py-2">Bayi</th>
                <th className="px-3 py-2">Durum</th>
                <th className="px-3 py-2 text-right">Hedef €</th>
                <th className="px-3 py-2 text-right">Gerçekleşen €</th>
                <th className="px-3 py-2">Gerçekleşme</th>
                <th className="px-3 py-2">Tempo</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b last:border-0 hover:bg-accent/40">
                  <td className="px-3 py-2">
                    <Link
                      href={`/admin/hedefler/${r.id}/${year}`}
                      className="font-medium hover:underline"
                    >
                      {r.name}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {[r.logo_code, r.city].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td className="px-3 py-2">
                    {r.t ? (
                      <Badge
                        variant={
                          r.t.status === "mutabik"
                            ? "success"
                            : r.t.status === "iptal"
                              ? "secondary"
                              : "warning"
                        }
                      >
                        {TARGET_STATUS_LABELS[r.t.status]}
                      </Badge>
                    ) : (
                      <Link
                        href={`/admin/hedefler/${r.id}/${year}`}
                        className="text-xs text-muted-foreground underline"
                      >
                        Hedef gir
                      </Link>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.tot ? fmtEur(r.tot.target_eur) : "—"}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">
                    {r.tot ? fmtEur(r.tot.actual_eur) : "—"}
                  </td>
                  <td className="px-3 py-2">
                    {r.pace?.ratio != null ? <PercentBar pct={r.pace.ratio * 100} /> : "—"}
                  </td>
                  <td className="px-3 py-2">
                    <PaceBadge pace={r.pace?.pace ?? null} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
