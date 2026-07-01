import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
import { todayIso } from "@/lib/week";
import { Card, CardContent } from "@/components/ui/card";

async function count(
  table: string,
  apply?: (q: any) => any
): Promise<number> {
  const supabase = createClient();
  let q = supabase.from(table).select("id", { count: "exact", head: true });
  if (apply) q = apply(q);
  const { count } = await q;
  return count ?? 0;
}

export default async function AdminHome() {
  await requireManager();
  const today = todayIso();

  const [openComplaints, todayVisits, totalDealers, observations] =
    await Promise.all([
      // Drafts default to status 'acik'; exclude them so counts reflect real work.
      count("complaints", (q) =>
        q.in("status", ["acik", "islemde"]).eq("is_draft", false)
      ),
      count("visits", (q) =>
        q.eq("status", "tamamlandi").eq("visit_date", today).is("deleted_at", null)
      ),
      count("companies", (q) =>
        q.eq("kind", "distributor").is("deleted_at", null)
      ),
      count("competitor_observations", (q) => q.eq("is_draft", false)),
    ]);

  const stats = [
    { label: "Açık şikayet", value: openComplaints, href: "/admin/sikayetler" },
    {
      label: "Bugün tamamlanan ziyaret",
      value: todayVisits,
      href: "/admin/ziyaretler?status=tamamlandi",
    },
    { label: "Toplam bayi", value: totalDealers, href: "/admin/bayiler" },
    {
      label: "Rakip gözlemi",
      value: observations,
      href: "/admin/rakip-haritasi",
    },
  ];

  const quickActions = [
    { label: "Yeni bayi ekle", href: "/admin/bayiler" },
    { label: "Rapor al", href: "/admin/raporlar" },
  ];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold">Yönetim Özeti</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map((s) => (
          <Link key={s.label} href={s.href}>
            <Card className="h-full hover:bg-accent">
              <CardContent className="p-4">
                <div className="text-3xl font-bold">{s.value}</div>
                <div className="text-sm text-muted-foreground">{s.label}</div>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>

      <div className="space-y-2">
        <div className="text-sm font-medium text-muted-foreground">
          Hızlı işlemler
        </div>
        <div className="flex flex-wrap gap-2">
          {quickActions.map((a) => (
            <Link
              key={a.href}
              href={a.href}
              className="rounded-md border px-3 py-1.5 text-sm font-medium hover:bg-accent"
            >
              {a.label}
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
