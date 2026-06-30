import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { requireManager } from "@/lib/auth";
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
  const today = new Date().toISOString().slice(0, 10);

  const [openComplaints, todayVisits, totalDealers, observations] =
    await Promise.all([
      count("complaints", (q) => q.in("status", ["acik", "islemde"])),
      count("visits", (q) =>
        q.eq("status", "tamamlandi").eq("visit_date", today).is("deleted_at", null)
      ),
      count("companies", (q) => q.eq("kind", "distributor")),
      count("competitor_observations"),
    ]);

  const stats = [
    { label: "Açık şikayet", value: openComplaints, href: "/admin/sikayetler" },
    { label: "Bugün tamamlanan ziyaret", value: todayVisits, href: "#" },
    { label: "Toplam bayi", value: totalDealers, href: "/admin/bayiler" },
    {
      label: "Rakip gözlemi",
      value: observations,
      href: "/admin/rakip-haritasi",
    },
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
    </div>
  );
}
