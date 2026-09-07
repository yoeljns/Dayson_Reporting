import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VisitRecord, type VisitRecordProduct } from "@/components/visit-record";
import { PrintButton } from "@/components/print-button";
import { ExpandAll } from "@/components/expand-all";
import { analyzeBrandSwitch } from "@/lib/analytics/brand-switch";
import { cn } from "@/lib/utils";
import {
  formatTRDate,
  daysSince,
  todayIso,
  isoDaysAgo,
  weekRangeLabel,
} from "@/lib/week";
import {
  VISIT_TYPE_LABELS,
  USER_ROLE_LABELS,
  COMPLAINT_STATUS_LABELS,
  PLAN_STATUS_LABELS,
  PLAN_STATUS_BADGE,
  type ComplaintStatus,
  type PlanStatus,
  type UserRole,
  type VisitType,
  type VisitStatus,
  type SupplyKind,
} from "@/lib/enums";
import type { QuestionWithOptions, VisitAnswer } from "@/types/db";

const PERIODS = [
  { key: "ay", label: "Bu ay" },
  { key: "3ay", label: "Son 3 ay" },
  { key: "yil", label: "Bu yıl" },
] as const;
type PeriodKey = (typeof PERIODS)[number]["key"];

function rangeFor(key: PeriodKey): { start: string; end: string } {
  const end = todayIso();
  if (key === "3ay") return { start: isoDaysAgo(90, end), end };
  if (key === "yil") return { start: `${end.slice(0, 4)}-01-01`, end };
  return { start: `${end.slice(0, 7)}-01`, end };
}

const VISIT_LIMIT = 40;

/** Calendar date of a timestamptz in the team's timezone (see week.ts). */
const TR_DATE = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

function one<T>(r: T | T[] | null | undefined): T | null {
  return Array.isArray(r) ? r[0] ?? null : r ?? null;
}

export default async function SalespersonFilePage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { d?: string };
}) {
  await requireManager();
  const supabase = createClient();
  const spId = params.id;
  const period = (PERIODS.find((p) => p.key === searchParams.d)?.key ??
    "ay") as PeriodKey;
  const { start, end } = rangeFor(period);

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, full_name, email, role, is_active")
    .eq("id", spId)
    .maybeSingle();
  if (!profile) notFound();

  // Assigned dealers first: their ids scope the last-visit lookup below, so we
  // never pull the whole company_last_visit table to serve one rep.
  const { data: assignRows } = await supabase
    .from("assignments")
    .select("company_id, companies(id, name, city, segment)")
    .eq("salesperson_id", spId)
    .limit(2000);
  const assignedIds = ((assignRows ?? []) as { company_id: string }[]).map(
    (a) => a.company_id
  );

  const [
    { data: visitRows },
    { data: lastVisits },
    { data: plans },
    { data: complaints },
    { data: questionRows },
    { data: cats },
    { data: periodVisitRows },
  ] = await Promise.all([
    supabase
      .from("visits")
      .select(
        "id, visit_date, visit_type, status, company_id, companies(id, name), contact:contact_id(name, role)"
      )
      .eq("salesperson_id", spId)
      .eq("status", "tamamlandi")
      .is("deleted_at", null)
      .gte("visit_date", start)
      .lte("visit_date", end)
      .order("visit_date", { ascending: false })
      .limit(VISIT_LIMIT),
    assignedIds.length
      ? supabase
          .from("company_last_visit")
          .select("company_id, last_visit_date")
          .in("company_id", assignedIds)
      : Promise.resolve({ data: [] as unknown[] }),
    supabase
      .from("visit_plans")
      .select("id, week_start, status, submitted_at, visit_plan_items(count)")
      .eq("salesperson_id", spId)
      .gte("week_start", isoDaysAgo(120))
      .order("week_start", { ascending: false })
      .limit(20),
    supabase
      .from("complaints")
      .select("id, title, status, due_date, created_at")
      .eq("reported_by", spId)
      .eq("is_draft", false)
      .gte("created_at", `${isoDaysAgo(1, start)}T00:00:00Z`)
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("questions")
      .select("*, question_options(*)")
      .order("sort_order"),
    supabase.from("product_categories").select("id, label_tr"),
    // Every dealer this rep actually visited in the period (for coverage).
    supabase
      .from("visits")
      .select("company_id")
      .eq("salesperson_id", spId)
      .eq("status", "tamamlandi")
      .is("deleted_at", null)
      .gte("visit_date", start)
      .lte("visit_date", end)
      .limit(20000),
  ]);

  type VisitRow = {
    id: string;
    visit_date: string;
    visit_type: VisitType;
    status: VisitStatus;
    company_id: string;
    companies: { id: string; name: string } | { id: string; name: string }[] | null;
    contact:
      | { name: string; role: string | null }
      | { name: string; role: string | null }[]
      | null;
  };
  const visits = (visitRows ?? []) as VisitRow[];
  const visitIds = visits.map((v) => v.id);

  const [{ data: answerRows }, { data: productRows }, { data: brandRows }] =
    await Promise.all([
      visitIds.length
        ? supabase.from("visit_answers").select("*").in("visit_id", visitIds)
        : Promise.resolve({ data: [] as VisitAnswer[] }),
      visitIds.length
        ? supabase
            .from("visit_product_answers")
            .select("visit_id, category_id, brand_id, supply_kind")
            .in("visit_id", visitIds)
        : Promise.resolve({ data: [] as unknown[] }),
      supabase.from("product_brands").select("id, name"),
    ]);

  const questions = (questionRows ?? []) as QuestionWithOptions[];
  const answersByVisit = new Map<string, VisitAnswer[]>();
  for (const a of (answerRows ?? []) as VisitAnswer[]) {
    const arr = answersByVisit.get(a.visit_id) ?? [];
    arr.push(a);
    answersByVisit.set(a.visit_id, arr);
  }
  const catLabel = new Map(
    ((cats ?? []) as { id: string; label_tr: string }[]).map((c) => [
      c.id,
      c.label_tr,
    ])
  );
  const brandName = new Map(
    ((brandRows ?? []) as { id: string; name: string }[]).map((b) => [
      b.id,
      b.name,
    ])
  );
  const productsByVisit = new Map<string, VisitRecordProduct[]>();
  for (const p of (productRows ?? []) as {
    visit_id: string;
    category_id: string;
    brand_id: string | null;
    supply_kind: SupplyKind;
  }[]) {
    const arr = productsByVisit.get(p.visit_id) ?? [];
    arr.push({
      categoryLabel: catLabel.get(p.category_id) ?? "—",
      brandLabel: (p.brand_id && brandName.get(p.brand_id)) || "—",
      supplyKind: p.supply_kind,
    });
    productsByVisit.set(p.visit_id, arr);
  }

  // Assigned dealers + coverage
  const lastVisitMap = new Map(
    (
      (lastVisits ?? []) as {
        company_id: string;
        last_visit_date: string | null;
      }[]
    ).map((r) => [r.company_id, r.last_visit_date])
  );
  const visitedInPeriod = new Map<string, number>();
  for (const v of (periodVisitRows ?? []) as { company_id: string }[])
    visitedInPeriod.set(v.company_id, (visitedInPeriod.get(v.company_id) ?? 0) + 1);

  const dealers = ((assignRows ?? []) as {
    company_id: string;
    companies:
      | { id: string; name: string; city: string | null; segment: string | null }
      | { id: string; name: string; city: string | null; segment: string | null }[]
      | null;
  }[])
    .map((a) => {
      const c = one(a.companies);
      const last = lastVisitMap.get(a.company_id) ?? null;
      return {
        id: a.company_id,
        name: c?.name ?? "—",
        city: c?.city ?? null,
        last,
        gap: last ? daysSince(last) : null,
        inPeriod: visitedInPeriod.get(a.company_id) ?? 0,
      };
    })
    .sort((a, b) => {
      if (a.gap === null && b.gap === null)
        return a.name.localeCompare(b.name, "tr");
      if (a.gap === null) return -1; // never visited first
      if (b.gap === null) return 1;
      return b.gap - a.gap; // stalest first
    });

  // The visit LIST is paged (VISIT_LIMIT); the period totals come from the
  // untruncated id-only query so the tiles never saturate at the page size.
  const periodVisits = (periodVisitRows ?? []) as { company_id: string }[];
  const periodVisitCount = periodVisits.length;

  // The query bound is padded by a day (UTC vs TR); trim to the exact TR window.
  const myComplaints = ((complaints ?? []) as {
    id: string;
    title: string;
    status: string;
    due_date: string | null;
    created_at: string;
  }[]).filter((c) => TR_DATE.format(new Date(c.created_at)) >= start);

  const coveredCount = dealers.filter((d) => d.inPeriod > 0).length;
  const coveragePct =
    dealers.length > 0 ? Math.round((coveredCount / dealers.length) * 100) : 0;

  // Wins/losses this rep drove: transitions on the dealers they visited.
  const brand = await analyzeBrandSwitch(supabase, start, end, {
    companyIds: [...new Set(periodVisits.map((v) => v.company_id))],
  });
  const myTransitions = brand.transitions.filter(
    (t) => t.salespersonId === spId
  );
  const won = myTransitions.filter((t) => t.won).length;
  const lost = myTransitions.length - won;

  const toRecord = (v: VisitRow) => ({
    id: v.id,
    visitDate: v.visit_date,
    visitType: v.visit_type,
    status: v.status,
    salesperson: null,
    companyName: one(v.companies)?.name ?? null,
    contactName: one(v.contact)?.name ?? null,
    contactRole: one(v.contact)?.role ?? null,
    questions,
    answers: answersByVisit.get(v.id) ?? [],
    products: productsByVisit.get(v.id) ?? [],
  });

  const last = visits[0];
  const older = visits.slice(1);

  return (
    <div className="mx-auto max-w-3xl space-y-6 text-[15px] leading-relaxed sm:text-base">
      <Link
        href="/admin"
        className="inline-block text-sm text-muted-foreground hover:text-foreground print:hidden"
      >
        ← Pano
      </Link>

      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-semibold">{profile.full_name}</h1>
              <p className="text-muted-foreground">
                {USER_ROLE_LABELS[profile.role as UserRole]} · {profile.email}
                {!profile.is_active ? " · Pasif" : ""}
              </p>
            </div>
            <PrintButton />
          </div>

          <div className="flex flex-wrap gap-2 print:hidden">
            {PERIODS.map((p) => (
              <Link
                key={p.key}
                href={`/admin/pazarlamaci/${spId}?d=${p.key}`}
                className={cn(
                  "rounded-full border px-4 py-2 text-sm font-medium",
                  p.key === period
                    ? "border-primary bg-primary text-primary-foreground"
                    : "hover:bg-accent"
                )}
              >
                {p.label}
              </Link>
            ))}
          </div>
          <p className="text-sm text-muted-foreground">
            {formatTRDate(start)} – {formatTRDate(end)}
          </p>
        </CardContent>
      </Card>

      {/* Özet */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Tamamlanan ziyaret" value={periodVisitCount} />
        <Stat label="Sorumlu bayi" value={dealers.length} />
        <Stat label="Dönemde ziyaret edilen" value={`%${coveragePct}`} />
        <Stat
          label="Kazanım / kayıp"
          value={`${won} / ${lost}`}
          tone={won > lost ? "good" : lost > won ? "bad" : "plain"}
        />
      </section>

      {/* Bayileri ve kapsama */}
      <section className="space-y-2">
        <h2 className="text-lg font-semibold">
          Sorumlu olduğu bayiler ({dealers.length})
        </h2>
        <p className="text-sm text-muted-foreground">
          En uzun süredir ziyaret edilmeyenler üstte.
        </p>
        <Card>
          <CardContent className="overflow-x-auto p-0">
            <table className="w-full">
              <thead className="border-b bg-muted/50 text-left text-sm">
                <tr>
                  <th className="p-2">Bayi</th>
                  <th className="p-2">Son ziyaret</th>
                  <th className="p-2 text-right">Geçen gün</th>
                  <th className="p-2 text-right">Dönemde</th>
                </tr>
              </thead>
              <tbody>
                {dealers.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-6 text-center text-muted-foreground">
                      Atanmış bayi yok.
                    </td>
                  </tr>
                ) : (
                  dealers.map((d) => (
                    <tr key={d.id} className="border-b last:border-0">
                      <td className="p-2">
                        <Link
                          href={`/admin/bayi/${d.id}`}
                          className="font-medium hover:underline"
                        >
                          {d.name}
                        </Link>
                        {d.city && (
                          <span className="text-muted-foreground"> · {d.city}</span>
                        )}
                      </td>
                      <td className="p-2">
                        {d.last ? formatTRDate(d.last) : "Hiç"}
                      </td>
                      <td
                        className={cn(
                          "p-2 text-right",
                          (d.gap ?? 999) > 30 && "font-semibold text-destructive"
                        )}
                      >
                        {d.gap ?? "—"}
                      </td>
                      <td className="p-2 text-right">{d.inPeriod}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>

      {/* Ziyaretleri */}
      <section className="space-y-2" id="rep-ziyaretler">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold">
            Ziyaretleri ({periodVisitCount}
            {periodVisitCount > visits.length
              ? ` — en yeni ${visits.length}`
              : ""})
          </h2>
          {older.length > 0 && <ExpandAll targetId="rep-ziyaretler" />}
        </div>
        {!last ? (
          <Card>
            <CardContent className="p-6 text-muted-foreground">
              Bu dönemde tamamlanmış ziyaret yok.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            <Card>
              <CardContent className="pt-5">
                <VisitRecord visit={toRecord(last)} showCompany />
              </CardContent>
            </Card>
            {older.map((v) => (
              <Card key={v.id}>
                <CardContent className="p-0">
                  <details className="group">
                    <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 p-4 hover:bg-accent">
                      <span className="font-semibold">
                        {formatTRDate(v.visit_date)}
                      </span>
                      <span className="font-medium">
                        {one(v.companies)?.name}
                      </span>
                      <span className="text-muted-foreground">
                        {VISIT_TYPE_LABELS[v.visit_type]}
                      </span>
                      <span className="ml-auto text-sm text-primary group-open:hidden">
                        Aç
                      </span>
                    </summary>
                    <div className="border-t p-4">
                      <VisitRecord visit={toRecord(v)} showHeader={false} />
                    </div>
                  </details>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Planlar + şikayetler */}
      <section className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Haftalık planları</h2>
          <Card>
            <CardContent className="pt-4">
              {!plans || plans.length === 0 ? (
                <p className="text-muted-foreground">Plan yok.</p>
              ) : (
                <ul className="space-y-2">
                  {plans.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-2">
                      <Link
                        href={`/admin/planlar/${p.id}`}
                        className="hover:underline"
                      >
                        {weekRangeLabel(p.week_start)}
                        <span className="text-muted-foreground">
                          {" "}
                          · {p.visit_plan_items?.[0]?.count ?? 0} firma
                        </span>
                      </Link>
                      <Badge variant={PLAN_STATUS_BADGE[p.status as PlanStatus]}>
                        {PLAN_STATUS_LABELS[p.status as PlanStatus]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Açtığı şikayetler</h2>
          <Card>
            <CardContent className="pt-4">
              {myComplaints.length === 0 ? (
                <p className="text-muted-foreground">
                  Bu dönemde şikayet açmamış.
                </p>
              ) : (
                <ul className="space-y-2">
                  {myComplaints.map((c) => (
                    <li key={c.id} className="flex items-start justify-between gap-2">
                      <Link
                        href={`/sikayet/${c.id}`}
                        className="hover:underline"
                      >
                        {c.title}
                        <span className="block text-sm text-muted-foreground">
                          {formatTRDate(c.created_at.slice(0, 10))}
                        </span>
                      </Link>
                      <Badge variant="secondary">
                        {COMPLAINT_STATUS_LABELS[c.status as ComplaintStatus]}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </section>
    </div>
  );
}

function Stat({
  label,
  value,
  tone = "plain",
}: {
  label: string;
  value: string | number;
  tone?: "good" | "bad" | "plain";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={cn(
            "text-2xl font-bold",
            tone === "good" && "text-green-700",
            tone === "bad" && "text-destructive"
          )}
        >
          {value}
        </div>
        <div className="text-sm text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
