import Link from "next/link";
import { Download } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { todayIso, formatTRDate, isoDaysAgo } from "@/lib/week";
import { analyzeBrandSwitch } from "@/lib/analytics/brand-switch";
import { analyzeComplaints } from "@/lib/analytics/complaints";
import { analyzeCoverage } from "@/lib/analytics/coverage";

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
  return { start: `${end.slice(0, 7)}-01`, end }; // this month
}

export default async function AnalizPage({
  searchParams,
}: {
  searchParams: { d?: string };
}) {
  await requireManager();
  const supabase = createClient();

  const period = (PERIODS.find((p) => p.key === searchParams.d)?.key ??
    "ay") as PeriodKey;
  const { start, end } = rangeFor(period);

  const [brand, complaints, coverage] = await Promise.all([
    analyzeBrandSwitch(supabase, start, end),
    analyzeComplaints(supabase, start, end),
    analyzeCoverage(supabase, start, end),
  ]);

  const won = brand.transitions.filter((t) => t.won);
  const lost = brand.transitions.filter((t) => !t.won);
  const net = won.length - lost.length;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Analiz</h1>
        <p className="text-sm text-muted-foreground">
          {formatTRDate(start)} – {formatTRDate(end)} arasının özeti.
        </p>
      </div>

      {/* Period chips */}
      <div className="flex flex-wrap gap-2">
        {PERIODS.map((p) => (
          <Link
            key={p.key}
            href={`/admin/analiz?d=${p.key}`}
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

      {/* 1) Brand switching */}
      <Section
        title="Daysona ve Daysondan dönüş"
        note="Aynı bayide aynı üründe marka değişimi. Önceki ziyarette rakip, sonrakinde biz varsak kazanım; tersi kayıptır."
        action={
          <ExcelLink href={`/api/admin/raporlar?type=kazanim&start=${start}&end=${end}`} />
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <BigStat label="Kazanım" value={won.length} tone="good" />
          <BigStat label="Kayıp" value={lost.length} tone="bad" />
          <BigStat
            label="Net"
            value={`${net > 0 ? "+" : ""}${net}`}
            tone={net > 0 ? "good" : net < 0 ? "bad" : "plain"}
          />
        </div>

        {brand.transitions.length === 0 ? (
          <Empty>Bu dönemde marka değişimi görülmedi.</Empty>
        ) : (
          <Table headers={["Tarih", "Bayi", "Ürün", "Değişim", "Pazarlamacı"]}>
            {brand.transitions.slice(0, 50).map((t, i) => (
              <tr key={`${t.companyId}-${t.date}-${i}`} className="border-b last:border-0">
                <td className="p-2 whitespace-nowrap">{formatTRDate(t.date)}</td>
                <td className="p-2 font-medium">{t.companyName}</td>
                <td className="p-2">{t.categoryLabel}</td>
                <td className="p-2">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-xs font-medium",
                      t.won
                        ? "bg-green-100 text-green-800"
                        : "bg-red-100 text-red-800"
                    )}
                  >
                    {t.won ? "Kazanım" : "Kayıp"}
                  </span>
                  <span className="ml-2 text-muted-foreground">
                    {t.fromLabel} → {t.toLabel}
                  </span>
                </td>
                <td className="p-2">{t.salesperson || "—"}</td>
              </tr>
            ))}
          </Table>
        )}
      </Section>

      {/* 2) Brand share */}
      <Section
        title="Ürünlerde marka payımız"
        note="Her üründe, o ürünü konuştuğumuz bayilerin yüzde kaçında bizim markamız var (son duruma göre)."
      >
        {brand.share.length === 0 ? (
          <Empty>Henüz ürün bilgisi girilmiş ziyaret yok.</Empty>
        ) : (
          <Table headers={["Ürün", "Bizde", "Toplam bayi", "Payımız", "Öne çıkan rakipler"]}>
            {brand.share.map((s) => {
              const pct =
                s.totalDealers > 0
                  ? Math.round((s.oursDealers / s.totalDealers) * 100)
                  : 0;
              return (
                <tr key={s.categoryLabel} className="border-b last:border-0">
                  <td className="p-2 font-medium">{s.categoryLabel}</td>
                  <td className="p-2 text-right">{s.oursDealers}</td>
                  <td className="p-2 text-right">{s.totalDealers}</td>
                  <td className="p-2">
                    <PercentBar pct={pct} />
                  </td>
                  <td className="p-2 text-muted-foreground">
                    {s.topCompetitors.length === 0
                      ? "—"
                      : s.topCompetitors
                          .map((c) => `${c.name} (${c.dealers})`)
                          .join(", ")}
                  </td>
                </tr>
              );
            })}
          </Table>
        )}
      </Section>

      {/* 3) Complaints */}
      <Section
        title="Şikayetler"
        note="Şikayetleri ne kadar sürede kapatıyoruz ve hangi bölüm geride kalıyor."
        action={
          <ExcelLink href={`/api/admin/raporlar?type=sikayet&start=${start}&end=${end}`} />
        }
      >
        <div className="grid grid-cols-3 gap-3">
          <BigStat
            label="Ortalama çözüm"
            value={
              complaints.avgResolutionDays === null
                ? "—"
                : `${complaints.avgResolutionDays} gün`
            }
            tone="plain"
          />
          <BigStat
            label="Zamanında kapanan"
            value={complaints.onTimePct === null ? "—" : `%${complaints.onTimePct}`}
            tone={
              complaints.onTimePct !== null && complaints.onTimePct < 70
                ? "bad"
                : "good"
            }
          />
          <BigStat
            label="Geciken açık"
            value={complaints.overdueOpen}
            tone={complaints.overdueOpen > 0 ? "bad" : "good"}
          />
        </div>

        {complaints.byDept.length === 0 ? (
          <Empty>Bu dönemde şikayet kaydı yok.</Empty>
        ) : (
          <Table headers={["Bölüm", "Açılan", "Çözülen", "Ort. gün", "Geciken"]}>
            {complaints.byDept.map((d) => (
              <tr key={d.label} className="border-b last:border-0">
                <td className="p-2 font-medium">{d.label}</td>
                <td className="p-2 text-right">{d.opened}</td>
                <td className="p-2 text-right">{d.resolved}</td>
                <td className="p-2 text-right">{d.avgDays ?? "—"}</td>
                <td
                  className={cn(
                    "p-2 text-right",
                    d.overdue > 0 && "font-semibold text-destructive"
                  )}
                >
                  {d.overdue}
                </td>
              </tr>
            ))}
          </Table>
        )}

        {complaints.byType.length > 0 && (
          <Table headers={["Şikayet türü", "Adet", "Pay"]}>
            {complaints.byType.map((t) => (
              <tr key={t.label} className="border-b last:border-0">
                <td className="p-2 font-medium">{t.label}</td>
                <td className="p-2 text-right">{t.count}</td>
                <td className="p-2">
                  <PercentBar
                    pct={
                      complaints.openedCount > 0
                        ? Math.round((t.count / complaints.openedCount) * 100)
                        : 0
                    }
                  />
                </td>
              </tr>
            ))}
          </Table>
        )}

        {complaints.byCategory.length > 0 && (
          <p className="text-sm text-muted-foreground">
            En çok şikayet alan ürünler:{" "}
            <span className="font-medium text-foreground">
              {complaints.byCategory
                .map((c) => `${c.label} (${c.count})`)
                .join(" · ")}
            </span>
          </p>
        )}
      </Section>

      {/* 4) Coverage */}
      <Section
        title="Bayi kapsama ve bölgeler"
        note="Bayileri en son ne zaman ziyaret ettik; hangi şehirlerde geride kalıyoruz."
        action={<ExcelLink href="/api/admin/raporlar?type=kapsama" />}
      >
        <Table headers={["Son ziyaret", "Bayi sayısı", "Pay"]}>
          {coverage.buckets.map((b) => (
            <tr key={b.label} className="border-b last:border-0">
              <td className="p-2 font-medium">{b.label}</td>
              <td className="p-2 text-right">{b.count}</td>
              <td className="p-2">
                <PercentBar
                  pct={
                    coverage.totalDealers > 0
                      ? Math.round((b.count / coverage.totalDealers) * 100)
                      : 0
                  }
                />
              </td>
            </tr>
          ))}
        </Table>

        <h3 className="pt-2 text-sm font-medium text-muted-foreground">
          Şehirlere göre (en zayıf kapsama üstte)
        </h3>
        <Table headers={["Şehir", "Bayi", "Dönemde ziyaret", "Kapsama", "Ort. gün"]}>
          {coverage.byCity.slice(0, 15).map((r) => (
            <GroupTr key={r.label} row={r} />
          ))}
        </Table>

        <h3 className="pt-2 text-sm font-medium text-muted-foreground">
          Segmentlere göre
        </h3>
        <Table headers={["Segment", "Bayi", "Dönemde ziyaret", "Kapsama", "Ort. gün"]}>
          {coverage.bySegment.map((r) => (
            <GroupTr key={r.label} row={r} />
          ))}
        </Table>
      </Section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Presentation bits — kept local and deliberately plain: big numbers, sorted
// tables, one bar. No charts (managers asked for the simplest readable form).
// ---------------------------------------------------------------------------

function Section({
  title,
  note,
  action,
  children,
}: {
  title: string;
  note: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{note}</p>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function BigStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | number;
  tone: "good" | "bad" | "plain";
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div
          className={cn(
            "text-3xl font-bold",
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

function PercentBar({ pct }: { pct: number }) {
  const safe = Math.max(0, Math.min(100, pct));
  return (
    <div className="flex items-center gap-2">
      <div className="h-2 w-24 shrink-0 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-primary" style={{ width: `${safe}%` }} />
      </div>
      <span className="text-sm font-medium tabular-nums">%{safe}</span>
    </div>
  );
}

function Table({
  headers,
  children,
}: {
  headers: string[];
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="overflow-x-auto p-0">
        <table className="w-full text-sm">
          <thead className="border-b bg-muted/50 text-left">
            <tr>
              {headers.map((h, i) => (
                <th key={h} className={cn("p-2", i > 0 && i < 3 && "text-right")}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function GroupTr({
  row,
}: {
  row: { label: string; dealers: number; visited: number; avgDays: number | null };
}) {
  const pct =
    row.dealers > 0 ? Math.round((row.visited / row.dealers) * 100) : 0;
  return (
    <tr className="border-b last:border-0">
      <td className="p-2 font-medium">{row.label}</td>
      <td className="p-2 text-right">{row.dealers}</td>
      <td className="p-2 text-right">{row.visited}</td>
      <td className="p-2">
        <PercentBar pct={pct} />
      </td>
      <td className="p-2 text-right">{row.avgDays ?? "—"}</td>
    </tr>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <Card>
      <CardContent className="p-6 text-center text-sm text-muted-foreground">
        {children}
      </CardContent>
    </Card>
  );
}

function ExcelLink({ href }: { href: string }) {
  return (
    <a
      href={href}
      className="inline-flex shrink-0 items-center gap-1.5 rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
    >
      <Download className="h-4 w-4" />
      Excel
    </a>
  );
}
