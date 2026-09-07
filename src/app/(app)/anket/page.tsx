import Link from "next/link";
import { ClipboardList, ChevronRight } from "lucide-react";
import { requireProfile } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { formatTRDate, todayIso } from "@/lib/week";
import { surveyMatches } from "@/lib/rules/survey";
import { COMPANY_KIND_LABELS } from "@/lib/enums";
import type { Survey } from "@/types/db";

export default async function SurveyListPage() {
  const profile = await requireProfile();
  const supabase = createClient();
  const [{ data }, { data: mine }] = await Promise.all([
    supabase
      .from("surveys")
      .select("*")
      .eq("status", "aktif")
      .order("updated_at", { ascending: false }),
    supabase
      .from("survey_answers")
      .select("survey_id")
      .eq("salesperson_id", profile.id),
  ]);
  const today = todayIso();
  const surveys = ((data as Survey[] | null) ?? []).filter((s) =>
    surveyMatches(s, { repId: profile.id, date: today })
  );
  const answered = new Map<string, number>();
  for (const a of mine ?? [])
    answered.set(a.survey_id, (answered.get(a.survey_id) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Özel Raporlar</h1>
        <p className="text-sm text-muted-foreground">
          Yönetimin sahadan istediği kısa soru listeleri. Bir firma seçip
          doldur; ziyaret sırasında sihirbazdan da açabilirsin.
        </p>
      </div>
      {surveys.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">
          Şu anda sana atanmış özel rapor yok.
        </p>
      ) : (
        <div className="space-y-2">
          {surveys.map((s) => (
            <Link key={s.id} href={`/anket/${s.id}`}>
              <Card className="hover:bg-accent">
                <CardContent className="flex items-center justify-between gap-3 p-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 font-medium">
                      <ClipboardList className="h-4 w-4 shrink-0 text-primary" />
                      <span>{s.name}</span>
                    </div>
                    {s.description && (
                      <p className="mt-0.5 text-sm text-muted-foreground">{s.description}</p>
                    )}
                    <div className="mt-0.5 text-xs text-muted-foreground">
                      {s.target_kinds && s.target_kinds.length > 0
                        ? s.target_kinds.map((k) => COMPANY_KIND_LABELS[k]).join(", ")
                        : "Tüm firmalar"}
                      {s.valid_to ? ` · ${formatTRDate(s.valid_to)} tarihine kadar` : ""}
                      {answered.get(s.id) ? ` · ${answered.get(s.id)} kez doldurdun` : ""}
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
