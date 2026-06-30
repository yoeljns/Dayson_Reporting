import Link from "next/link";
import { Plus, FileEdit, AlertTriangle, CalendarDays, History } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { requireProfile } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { VISIT_TYPE_LABELS } from "@/lib/enums";

export default async function HomePage() {
  const profile = await requireProfile();
  const supabase = createClient();
  const today = new Date().toISOString().slice(0, 10);

  const [{ data: drafts }, { count: todayCount }, { count: openComplaints }] =
    await Promise.all([
      supabase
        .from("visits")
        .select("id, visit_type, visit_date, created_at, companies(name, kind)")
        .eq("status", "taslak")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(20),
      supabase
        .from("visits")
        .select("id", { count: "exact", head: true })
        .eq("status", "tamamlandi")
        .eq("visit_date", today)
        .is("deleted_at", null),
      supabase
        .from("complaints")
        .select("id", { count: "exact", head: true })
        .in("status", ["acik", "islemde"]),
    ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">
            Merhaba, {profile.full_name || "👋"}
          </h1>
          <p className="text-sm text-muted-foreground">
            Bugün {todayCount ?? 0} ziyaret tamamlandı
          </p>
        </div>
      </div>

      <Link href="/ziyaret/yeni" className="block">
        <Button size="lg" className="h-16 w-full text-lg">
          <Plus className="mr-2 h-6 w-6" />
          Yeni Ziyaret
        </Button>
      </Link>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/plan">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
              <CalendarDays className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Haftalık Plan</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/son-ziyaretler">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
              <History className="h-6 w-6 text-primary" />
              <span className="text-sm font-medium">Son Ziyaretler</span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Link href="/sikayet/yeni">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
              <AlertTriangle className="h-6 w-6 text-amber-500" />
              <span className="text-sm font-medium">Şikayet Bildir</span>
            </CardContent>
          </Card>
        </Link>
        <Link href="/sikayetler">
          <Card className="h-full transition-colors hover:bg-accent">
            <CardContent className="flex flex-col items-center gap-1 p-4 text-center">
              <span className="text-2xl font-bold">{openComplaints ?? 0}</span>
              <span className="text-sm text-muted-foreground">
                Açık şikayet
              </span>
            </CardContent>
          </Card>
        </Link>
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="section-label flex items-center gap-2">
            <FileEdit className="h-3.5 w-3.5" />
            Tamamlanmamış Ziyaretler
          </CardTitle>
          {drafts && drafts.length > 0 && (
            <Badge variant="warning">{drafts.length}</Badge>
          )}
        </CardHeader>
        <CardContent className="space-y-2">
          {!drafts || drafts.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Bekleyen taslak yok. 🎉
            </p>
          ) : (
            drafts.map((d) => {
              const company = Array.isArray(d.companies)
                ? d.companies[0]
                : (d.companies as { name: string } | null);
              return (
                <Link
                  key={d.id}
                  href={`/ziyaret/${d.id}`}
                  className="flex items-center justify-between rounded-md border border-l-4 border-l-[hsl(var(--gold))] p-3 hover:bg-accent"
                >
                  <div>
                    <div className="font-medium">
                      {company?.name ?? "Firma"}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {VISIT_TYPE_LABELS[d.visit_type as keyof typeof VISIT_TYPE_LABELS]} · {d.visit_date}
                    </div>
                  </div>
                  <Badge variant="warning">Taslak</Badge>
                </Link>
              );
            })
          )}
        </CardContent>
      </Card>
    </div>
  );
}
